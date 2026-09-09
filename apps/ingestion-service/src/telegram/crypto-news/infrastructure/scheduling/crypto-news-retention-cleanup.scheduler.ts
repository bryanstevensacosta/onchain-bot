import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { promises as fs } from 'fs';
import { DataSource } from 'typeorm';
import type { AppConfig } from 'shared/common/config/app.config';

export const INGESTION_RETENTION_ADVISORY_LOCK_ID = 9_421_373;

const RETENTION_BATCH_SIZE = 1000;

@Injectable()
export class CryptoNewsRetentionCleanupScheduler {
  private readonly logger = new Logger(
    CryptoNewsRetentionCleanupScheduler.name,
  );
  private running = false;

  public constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  public async tick(): Promise<void> {
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

      const hours = Math.max(
        1,
        this.config.get<AppConfig>('app')?.cryptoNewsMediaRetentionHours ?? 72,
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
        `crypto-news retention tick failed: ${(err as Error).message}`,
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
        'crypto-news retention tick done',
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
          'FROM crypto_news_message_media m ' +
          'INNER JOIN crypto_news_messages p ON p.id = m.message_id ' +
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
          'DELETE FROM crypto_news_message_media WHERE id = $1',
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
      'DELETE FROM crypto_news_messages WHERE id IN (' +
        'SELECT id FROM crypto_news_messages ' +
        `WHERE ingested_at < now() - ($1 * interval '1 hour') ` +
        `LIMIT ${RETENTION_BATCH_SIZE}` +
        ') RETURNING id',
      [hours],
    );
    return result.length;
  }

  private async sweepOrphanMediaRows(): Promise<number> {
    const result: ReadonlyArray<{ id: string }> = await this.dataSource.query(
      'DELETE FROM crypto_news_message_media WHERE message_id NOT IN ' +
        '(SELECT id FROM crypto_news_messages) RETURNING id',
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
    const { readdir, stat, unlink } = await import('fs/promises');
    const path = await import('path');

    const uploadsRoot: string =
      this.config.get('app.uploads.root') ??
      this.config.get('app.uploadsRoot') ??
      'uploads';
    const mediaSub: string =
      this.config.get('app.uploads.mediaPath') ?? 'crypto-news/media';
    const mediaRoot: string = path.isAbsolute(uploadsRoot)
      ? path.join(uploadsRoot, mediaSub)
      : path.join(process.cwd(), uploadsRoot, mediaSub);

    let dbPaths: Set<string> = new Set<string>();
    try {
      const rows: Array<{ file_path: string }> = await this.dataSource.query(
        'SELECT file_path FROM crypto_news_message_media',
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
