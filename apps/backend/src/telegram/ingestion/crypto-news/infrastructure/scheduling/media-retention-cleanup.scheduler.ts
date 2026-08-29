import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { promises as fs } from 'fs';
import { DataSource } from 'typeorm';
import type { AppConfig } from 'shared/common/config/app.config';

/**
 * Postgres advisory-lock ID used to ensure only one backend process
 * (or replica) runs the media-retention cleanup at a time. The value
 * is arbitrary; what matters is that all replicas of the backend use
 * the SAME id so `pg_try_advisory_lock` rejects the second one.
 *
 * MUST NOT equal `PUBLISHER_ADVISORY_LOCK_ID` (7_421_371) — the two
 * cron jobs run on independent ticks and would otherwise serialise on
 * each other's lock.
 */
const MEDIA_RETENTION_ADVISORY_LOCK_ID = 7_421_372;

/** Max rows pulled per SELECT batch — keeps the in-memory row set bounded. */
const CLEANUP_BATCH_SIZE = 1000;

/**
 * Hourly media retention cleanup for `crypto_news_message_media`.
 *
 * Runs every hour. On each tick:
 *  0. In-memory / no-DB guard: if `dataSource.options.type !== 'postgres'`
 *     (DATABASE_ENABLED=false → in-memory repos), return immediately.
 *     The cron is a harmless no-op outside DB mode; it never reaches
 *     raw SQL on a non-Postgres connection.
 *  1. `pg_try_advisory_lock(<id>)` — non-blocking. If `false`, another
 *     process / tick is already cleaning → return.
 *  2. Read `AppConfig.cryptoNewsMediaRetentionHours` (default 24),
 *     clamped to ≥ 1 hour at the seam.
 *  3. Batched JOIN-based cleanup (CRITICAL: `crypto_news_message_media`
 *     has no `ingested_at` of its own — the window is the parent
 *     message's `ingested_at`):
 *       SELECT m.id, m.file_path
 *         FROM crypto_news_message_media m
 *         INNER JOIN crypto_news_messages p ON p.id = m.message_id
 *         WHERE p.ingested_at < now() - ($1 * interval '1 hour')
 *         LIMIT 1000
 *     For each row: `fs.promises.unlink(row.file_path)` (path used
 *     AS-IS — already absolute per MtprotoMediaDownloader). Then
 *     `DELETE FROM crypto_news_message_media WHERE id = $1`. Loop
 *     until a batch returns 0 rows.
 *  4. `pg_advisory_unlock(<id>)` — release the lock in `finally` so
 *     a thrown error in the cleanup still releases the lock.
 *
 * **What this cron NEVER does**: never deletes `crypto_news_messages`
 * rows (text retained forever); never adds an `ingested_at` column to
 * the media entity (the window is the parent's); never calls
 * `path.resolve(uploadsRoot, ...)` (the stored path is already
 * absolute — prepending `uploadsRoot` would double-resolve and break).
 *
 * Error policy on the per-row unlink:
 *  - ENOENT (file already gone)         → continue, row is still deleted.
 *  - EACCES / ENOTDIR / EISDIR / EPERM  → log + count as `errors`, row
 *                                          is NOT deleted (batch continues).
 *  - other errors                       → log + ABORT the batch (lock
 *                                          is still released in finally).
 */
@Injectable()
export class MediaRetentionCleanupScheduler {
  private readonly logger = new Logger(MediaRetentionCleanupScheduler.name);
  private running = false;

  public constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  /**
   * Cron tick. Runs at the start of every hour.
   * The decorator-based approach keeps the scheduling config
   * co-located with the handler (matches `PublisherCronScheduler`).
   */
  @Cron(CronExpression.EVERY_HOUR)
  public async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('previous tick still running; skipping this tick');
      return;
    }

    // No-DB guard: in-memory / non-Postgres deployments must never
    // reach raw SQL. The cron's only purpose is to clean Postgres rows.
    if (this.dataSource.options.type !== 'postgres') {
      return;
    }

    this.running = true;
    let lockHeld = false;
    let deletedMedia = 0;
    let unlinkedFiles = 0;
    let errors = 0;
    try {
      lockHeld = await this.tryAcquireLock();
      if (!lockHeld) {
        this.logger.log(
          'advisory lock held by another process — skipping tick',
        );
        return;
      }

      const hours = Math.max(
        1,
        this.config.get<AppConfig>('app')?.cryptoNewsMediaRetentionHours ?? 24,
      );

      // Batched loop: keep deleting 1000 rows at a time until the SELECT
      // returns an empty set. The next hourly tick picks up any remainder.
      for (;;) {
        const result = await this.processBatch(hours);
        deletedMedia += result.deletedMedia;
        unlinkedFiles += result.unlinkedFiles;
        errors += result.errors;
        if (result.processed === 0) break;
      }
      // Permanent fix for orphans: delete files on disk not in DB and older than 24h
      try {
        const orphans = await this.cleanupOrphanFiles();
        if (orphans > 0)
          this.logger.log(`orphan media cleanup: removed ${orphans} file(s)`);
      } catch (e) {
        this.logger.warn(`orphan cleanup failed: ${(e as Error).message}`);
      }
    } catch (err) {
      this.logger.error(
        `media retention tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    } finally {
      this.logger.log(
        { deletedMedia, unlinkedFiles, errors },
        'media retention tick done',
      );
      if (lockHeld) {
        try {
          await this.releaseLock();
        } catch (unlockErr) {
          this.logger.error(
            `failed to release advisory lock: ${(unlockErr as Error).message}`,
          );
        }
      }
      this.running = false;
    }
  }

  /**
   * Process a single batch (up to `CLEANUP_BATCH_SIZE` rows).
   *
   * Returns:
   *  - `processed` : rows fetched in this batch. Caller uses 0 to stop.
   *  - `deletedMedia`: rows successfully DELETEd.
   *  - `unlinkedFiles`: rows whose on-disk file was successfully unlinked
   *    (or already absent — ENOENT still counts as "ok" for the file).
   *  - `errors`      : rows that hit a "log and continue" unlink error
   *    (EACCES / ENOTDIR / EISDIR / EPERM). Such rows are NOT deleted
   *    and the batch continues.
   *
   * Throws only on "abort the batch" errors (non-ENOENT/permission
   * unlink failures or SELECT/DELETE errors). The outer `tick` catches
   * these and still releases the lock.
   */
  private async processBatch(hours: number): Promise<{
    processed: number;
    deletedMedia: number;
    unlinkedFiles: number;
    errors: number;
  }> {
    const rows: ReadonlyArray<{ id: string; file_path: string }> =
      await this.dataSource.query(
        'SELECT m.id, m.file_path ' +
          'FROM crypto_news_message_media m ' +
          'INNER JOIN crypto_news_messages p ON p.id = m.message_id ' +
          `WHERE p.ingested_at < now() - ($1 * interval '1 hour') ` +
          `LIMIT ${CLEANUP_BATCH_SIZE}`,
        [hours],
      );

    if (rows.length === 0) {
      return { processed: 0, deletedMedia: 0, unlinkedFiles: 0, errors: 0 };
    }

    let deletedMedia = 0;
    let unlinkedFiles = 0;
    let errors = 0;

    for (const row of rows) {
      const unlinkOutcome = await this.tryUnlink(row.file_path);
      if (unlinkOutcome === 'ok' || unlinkOutcome === 'already-gone') {
        unlinkedFiles += 1;
        await this.dataSource.query(
          'DELETE FROM crypto_news_message_media WHERE id = $1',
          [row.id],
        );
        deletedMedia += 1;
      } else if (unlinkOutcome === 'skip') {
        // Permission-style failure: log, count, leave the row in place
        // (it will be retried on a future tick). Do NOT abort the batch —
        // other rows may still be unlinkable.
        errors += 1;
      } else {
        // 'abort' — non-ENOENT/EACCES/ENOTDIR/EISDIR/EPERM error.
        // Bubble up so the outer finally still releases the lock and
        // the partial summary is logged.
        throw new Error(`unlink failed for ${row.file_path} — aborting batch`);
      }
    }

    return { processed: rows.length, deletedMedia, unlinkedFiles, errors };
  }

  /**
   * Best-effort unlink with the per-policy outcomes:
   *  - 'ok'           : unlink resolved.
   *  - 'already-gone' : ENOENT — the file is already absent; treat as
   *                     success (the row is still deleted, freeing the DB).
   *  - 'skip'         : EACCES / ENOTDIR / EISDIR / EPERM — log + count
   *                     as error; do NOT delete the row.
   *  - 'abort'        : any other failure — caller throws.
   */
  private async tryUnlink(
    filePath: string,
  ): Promise<'ok' | 'already-gone' | 'skip' | 'abort'> {
    try {
      await fs.unlink(filePath);
      return 'ok';
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        return 'already-gone';
      }
      if (
        code === 'EACCES' ||
        code === 'ENOTDIR' ||
        code === 'EISDIR' ||
        code === 'EPERM'
      ) {
        this.logger.warn(
          `unlink ${filePath} failed with ${code}: ${(err as Error).message} — leaving row in place`,
        );
        return 'skip';
      }
      this.logger.error(
        `unlink ${filePath} failed unexpectedly (${code ?? 'no-code'}): ${(err as Error).message}`,
      );
      return 'abort';
    }
  }

  /**
   * `pg_try_advisory_lock` is non-blocking. Returns `true` if the lock
   * was acquired by this connection, `false` otherwise.
   *
   * Falls through with `false` (no lock acquired) when the database
   * is unreachable — the cron must not crash boot or the scheduler.
   */
  private async cleanupOrphanFiles(): Promise<number> {
    const { readdir, stat, unlink } = await import('fs/promises');
    const path = await import('path');
    const appCfg = this.config.get<AppConfig>('app', { infer: true });
    const uploadsRoot =
      appCfg?.uploadsRoot ?? path.join(process.cwd(), 'uploads');
    const mediaRoot = path.join(uploadsRoot, 'crypto-news', 'media');
    let deleted = 0;
    const walk = async (dir: string): Promise<void> => {
      let entries: import('fs').Dirent[] = [];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = (
          path as unknown as { join: (...a: string[]) => string }
        ).join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (
          e.isFile() &&
          !e.name.endsWith('.tmp') &&
          !dbPaths.has(e.name) // eslint-disable-line @typescript-eslint/no-unsafe-call
        ) {
          try {
            const st = await stat(full);
            if (Date.now() - st.mtimeMs > 24 * 60 * 60 * 1000) {
              await unlink(full);
              deleted++;
            }
          } catch (_e2) {
            /* ignore stat/unlink */
          }
        }
      }
    };
    try {
      await walk(mediaRoot);
    } catch (_e3) {
      /* ignore walk */
    }
    return deleted;
  }

  private async tryAcquireLock(): Promise<boolean> {
    try {
      const result: ReadonlyArray<{ acquired: boolean }> =
        await this.dataSource.query(
          'SELECT pg_try_advisory_lock($1) AS acquired',
          [MEDIA_RETENTION_ADVISORY_LOCK_ID],
        );
      const row = result[0];
      return row?.acquired === true;
    } catch (err) {
      this.logger.error(
        `advisory_lock query failed: ${(err as Error).message}`,
      );
      return false;
    }
  }

  private async releaseLock(): Promise<void> {
    await this.dataSource.query('SELECT pg_advisory_unlock($1)', [
      MEDIA_RETENTION_ADVISORY_LOCK_ID,
    ]);
  }
}
