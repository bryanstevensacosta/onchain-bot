import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { promises as fs } from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import type { AppConfig } from 'shared/common/config/app.config';
import {
  DISK_CRITICAL_THRESHOLD_PERCENT,
  DISK_WARN_THRESHOLD_PERCENT,
  DiskMonitorService,
} from './disk-monitor.service';

export const INGESTION_RETENTION_ADVISORY_LOCK_ID = 9_421_373;

/** Cutoff override (hours) used by aggressiveCleanup() under disk pressure. */
export const AGGRESSIVE_CLEANUP_RETENTION_HOURS = 48;

const RETENTION_BATCH_SIZE = 1000;

@Injectable()
export class FeedRetentionCleanupScheduler {
  private readonly logger = new Logger(FeedRetentionCleanupScheduler.name);
  private running = false;
  private readonly diskMonitor: DiskMonitorService;

  public constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @Optional() diskMonitor?: DiskMonitorService,
  ) {
    this.diskMonitor = diskMonitor ?? new DiskMonitorService(config);
  }

  /**
   * Scheduled expiry cleanup — daily at 3AM.
   *
   * Two-pass semantics (media pass + messages pass, advisory lock
   * 9_421_373, clock ingested_at, 72h default from
   * INGESTION_CRYPTO_NEWS_MEDIA_RETENTION_HOURS) are unchanged from the
   * former hourly tick; only the schedule changed.
   */
  @Cron('0 3 * * *')
  public async cleanupExpiredContent(hoursOverride?: number): Promise<void> {
    await this.runCleanup(hoursOverride);
  }

  /**
   * Legacy entrypoint kept for backward compatibility (existing specs and
   * any manual callers). Delegates to cleanupExpiredContent().
   */
  public async tick(): Promise<void> {
    await this.cleanupExpiredContent();
  }

  /**
   * Hourly disk-pressure check: >90% runs aggressiveCleanup() (48h
   * cutoff), >80% runs the normal cleanup early, else logs at debug.
   * A failed disk probe is logged and the tick survives.
   */
  @Cron(CronExpression.EVERY_HOUR)
  public async checkDiskAndCleanup(): Promise<void> {
    let usage: number;
    try {
      usage = await this.diskMonitor.getDiskUsage();
    } catch (err) {
      this.logger.warn(
        `disk usage probe failed: ${(err as Error).message} — skipping disk-triggered cleanup`,
      );
      return;
    }
    if (usage > DISK_CRITICAL_THRESHOLD_PERCENT) {
      this.logger.error(
        `disk usage critical at ${usage.toFixed(1)}% — running aggressive cleanup (48h cutoff)`,
      );
      await this.aggressiveCleanup();
    } else if (usage > DISK_WARN_THRESHOLD_PERCENT) {
      this.logger.warn(
        `disk usage high at ${usage.toFixed(1)}% — running cleanup early`,
      );
      await this.cleanupExpiredContent();
    } else {
      this.logger.debug(`disk usage nominal at ${usage.toFixed(1)}%`);
    }
  }

  /**
   * Aggressive cleanup under critical disk pressure: same two passes
   * with the cutoff overridden from 72h to 48h.
   */
  public async aggressiveCleanup(): Promise<void> {
    await this.cleanupExpiredContent(AGGRESSIVE_CLEANUP_RETENTION_HOURS);
  }

  private async runCleanup(hoursOverride?: number): Promise<void> {
    if (this.running) {
      this.logger.warn('previous tick still running; skipping this tick');
      return;
    }

    if (this.dataSource.options.type !== 'postgres') {
      return;
    }

    this.running = true;
    let lockHeld = false;
    let deletedMedia = 0;
    let unlinkedFiles = 0;
    let mediaErrors = 0;
    let deletedMessages = 0;
    let deletedOrphans = 0;
    try {
      lockHeld = await this.tryAcquireLock();
      if (!lockHeld) {
        this.logger.log(
          'advisory lock held by another process — skipping tick',
        );
        return;
      }

      const hours =
        hoursOverride ??
        Math.max(
          1,
          this.config.get<AppConfig>('app')?.feedMediaRetentionHours ?? 72,
        );

      for (;;) {
        const result = await this.processMediaBatch(hours);
        deletedMedia += result.deletedMedia;
        unlinkedFiles += result.unlinkedFiles;
        mediaErrors += result.errors;
        if (result.processed === 0) break;
      }

      for (;;) {
        const deleted = await this.processMessageBatch(hours);
        deletedMessages += deleted;
        if (deleted === 0) break;
      }

      deletedOrphans = await this.sweepOrphanMediaRows();

      try {
        const orphans = await this.cleanupOrphanFiles();
        if (orphans > 0)
          this.logger.log(`orphan media cleanup: removed ${orphans} file(s)`);
      } catch (e) {
        this.logger.warn(`orphan cleanup failed: ${(e as Error).message}`);
      }
    } catch (err) {
      this.logger.error(
        `feed retention tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    } finally {
      this.logger.log(
        {
          deletedMedia,
          unlinkedFiles,
          mediaErrors,
          deletedMessages,
          deletedOrphans,
        },
        'feed retention tick done',
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

  private async processMediaBatch(hours: number): Promise<{
    processed: number;
    deletedMedia: number;
    unlinkedFiles: number;
    errors: number;
  }> {
    const rows: ReadonlyArray<{ id: string; file_path: string }> =
      await this.dataSource.query(
        'SELECT m.id, m.file_path ' +
          'FROM telegram_feed_message_media m ' +
          'INNER JOIN telegram_feed_messages p ON p.id = m.message_id ' +
          `WHERE p.ingested_at < now() - ($1 * interval '1 hour') ` +
          `LIMIT ${RETENTION_BATCH_SIZE}`,
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
          'DELETE FROM telegram_feed_message_media WHERE id = $1',
          [row.id],
        );
        deletedMedia += 1;
      } else if (unlinkOutcome === 'skip') {
        errors += 1;
      } else {
        throw new Error(`unlink failed for ${row.file_path} — aborting batch`);
      }
    }

    return { processed: rows.length, deletedMedia, unlinkedFiles, errors };
  }

  private async processMessageBatch(hours: number): Promise<number> {
    const result: ReadonlyArray<{ id: string }> = await this.dataSource.query(
      'DELETE FROM telegram_feed_messages WHERE id IN (' +
        'SELECT id FROM telegram_feed_messages ' +
        `WHERE ingested_at < now() - ($1 * interval '1 hour') ` +
        `LIMIT ${RETENTION_BATCH_SIZE}` +
        ') RETURNING id',
      [hours],
    );
    return result.length;
  }

  private async sweepOrphanMediaRows(): Promise<number> {
    const result: ReadonlyArray<{ id: string }> = await this.dataSource.query(
      'DELETE FROM telegram_feed_message_media WHERE message_id NOT IN ' +
        '(SELECT id FROM telegram_feed_messages) RETURNING id',
    );
    return result.length;
  }

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

  private async cleanupOrphanFiles(): Promise<number> {
    // Static imports (testable under jest; dynamic import() needs
    // --experimental-vm-modules and silently disabled this sweep in tests).
    // Scope is FIXED to the message-media tree: avatar storage
    // (`uploads/avatar/`) is never walked (P19, pinned by spec).
    const { readdir, stat, unlink } = fs;

    const uploadsRoot: string =
      this.config.get('app.uploads.root') ??
      this.config.get('app.uploadsRoot') ??
      'uploads';
    const mediaSub: string =
      this.config.get('app.uploads.mediaPath') ?? 'feed/media';
    const mediaRoot: string = path.isAbsolute(uploadsRoot)
      ? path.join(uploadsRoot, mediaSub)
      : path.join(process.cwd(), uploadsRoot, mediaSub);

    let dbPaths: Set<string> = new Set<string>();
    try {
      const rows: Array<{ file_path: string }> = await this.dataSource.query(
        'SELECT file_path FROM telegram_feed_message_media',
      );
      dbPaths = new Set<string>(rows.map((r) => path.basename(r.file_path)));
    } catch {
      return 0;
    }

    let deleted = 0;
    const walk = async (dir: string): Promise<void> => {
      let entries: import('fs').Dirent[] = [];
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) await walk(full);
        else if (
          e.isFile() &&
          !e.name.endsWith('.tmp') &&
          !dbPaths.has(e.name)
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
          [INGESTION_RETENTION_ADVISORY_LOCK_ID],
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
      INGESTION_RETENTION_ADVISORY_LOCK_ID,
    ]);
  }
}
