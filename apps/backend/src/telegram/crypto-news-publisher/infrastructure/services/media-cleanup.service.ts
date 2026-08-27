import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { stat } from 'node:fs/promises';

export interface MediaCleanupResult {
  deleted: number;
  errors: string[];
}

@Injectable()
export class MediaCleanupService {
  private readonly logger = new Logger(MediaCleanupService.name);

  /**
   * Cleans up published media files older than the specified TTL.
   *
   * @param paths - Array of file paths to check for cleanup
   * @param ttlDays - Time-to-live in days. Files older than this will be deleted.
   *                 If 0, cleanup is skipped entirely.
   * @returns Object with deleted count and any errors encountered
   */
  async cleanupPublishedMedia(
    paths: string[],
    ttlDays: number,
  ): Promise<MediaCleanupResult> {
    const result: MediaCleanupResult = { deleted: 0, errors: [] };

    if (ttlDays === 0) {
      this.logger.debug('Media cleanup skipped (ttlDays === 0)');
      return result;
    }

    const cutoffTime = Date.now() - ttlDays * 24 * 60 * 60 * 1000;

    for (const filePath of paths) {
      try {
        const stats = await stat(filePath);

        if (!stats.isFile()) {
          this.logger.warn(`Skipping non-file path: ${filePath}`);
          continue;
        }

        const mtimeMs = stats.mtimeMs;
        if (mtimeMs < cutoffTime) {
          await fs.unlink(filePath);
          result.deleted++;
          this.logger.log(`Deleted expired media file: ${filePath}`);
        } else {
          this.logger.debug(
            `File not expired yet (age: ${Math.round((Date.now() - mtimeMs) / (24 * 60 * 60 * 1000))} days): ${filePath}`,
          );
        }
      } catch (err) {
        if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
          this.logger.warn(
            `Media file not found (already deleted?): ${filePath}`,
          );
          continue;
        }
        const message = err instanceof Error ? err.message : 'unknown error';
        this.logger.error(
          `Failed to cleanup media file ${filePath}: ${message}`,
        );
        result.errors.push(`${filePath}: ${message}`);
      }
    }

    this.logger.log(
      `Media cleanup completed: ${result.deleted} file(s) deleted, ${result.errors.length} error(s)`,
    );

    return result;
  }
}
