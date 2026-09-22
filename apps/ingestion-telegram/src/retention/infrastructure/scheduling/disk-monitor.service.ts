import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Typed error thrown when disk inspection fails (statfs/readdir/stat).
 *
 * The retention scheduler catches this, logs, and continues the tick —
 * a disk-probe failure must never crash the scheduled cleanup.
 */
export class DiskMonitorError extends Error {
  public constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'DiskMonitorError';
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export const DISK_WARN_THRESHOLD_PERCENT = 80;
export const DISK_CRITICAL_THRESHOLD_PERCENT = 90;

/**
 * DiskMonitorService — disk-pressure probe for the crypto-news janitor.
 *
 * - `getDiskUsage()` reads `fs.statfs(uploadsRoot)` and returns percent
 *   used (0-100).
 * - `getDirectorySize()` recursively sums file sizes under `uploads/`.
 * - Both throw {@link DiskMonitorError} on fs failures; callers log and
 *   continue.
 *
 * Uploads root resolution mirrors
 * `CryptoNewsRetentionCleanupScheduler.cleanupOrphanFiles()`:
 * `app.uploads.root` ?? `app.uploadsRoot` ?? `'uploads'`.
 */
@Injectable()
export class DiskMonitorService {
  private readonly logger = new Logger(DiskMonitorService.name);

  public constructor(private readonly config: ConfigService) {}

  /**
   * Resolve the uploads root directory (absolute path).
   */
  public getUploadsRoot(): string {
    const uploadsRoot: string =
      this.config.get('app.uploads.root') ??
      this.config.get('app.uploadsRoot') ??
      'uploads';
    return path.isAbsolute(uploadsRoot)
      ? uploadsRoot
      : path.join(process.cwd(), uploadsRoot);
  }

  /**
   * Return disk usage percent (0-100) for the filesystem holding uploads.
   *
   * @throws {DiskMonitorError} when `statfs` fails.
   */
  public async getDiskUsage(targetDir?: string): Promise<number> {
    const target = targetDir ?? this.getUploadsRoot();
    let stats: { blocks: number; bfree: number; bsize: number };
    try {
      stats = await fs.statfs(target);
    } catch (err) {
      throw new DiskMonitorError(
        `statfs failed for ${target}: ${(err as Error).message}`,
        { cause: err },
      );
    }
    const total = stats.blocks * stats.bsize;
    if (!Number.isFinite(total) || total <= 0) {
      this.logger.debug(`statfs for ${target} reported no blocks; using 0%`);
      return 0;
    }
    const used = total - stats.bfree * stats.bsize;
    const percent = (used / total) * 100;
    return Math.min(100, Math.max(0, percent));
  }

  /**
   * Recursively sum file sizes (bytes) under a directory.
   * Defaults to the uploads root.
   *
   * Individual unreadable entries are skipped; a failure to read the
   * top-level directory throws {@link DiskMonitorError}.
   *
   * @throws {DiskMonitorError} when the root directory cannot be read.
   */
  public async getDirectorySize(dir?: string): Promise<number> {
    const root = dir ?? this.getUploadsRoot();
    try {
      return await this.walkSize(root);
    } catch (err) {
      if (err instanceof DiskMonitorError) throw err;
      throw new DiskMonitorError(
        `directory size walk failed for ${root}: ${(err as Error).message}`,
        { cause: err },
      );
    }
  }

  private async walkSize(current: string, depth = 0): Promise<number> {
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (err) {
      if (depth === 0) {
        throw new DiskMonitorError(
          `cannot read directory ${current}: ${(err as Error).message}`,
          { cause: err },
        );
      }
      return 0;
    }
    let total = 0;
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          total += await this.walkSize(full, depth + 1);
        } else if (entry.isFile()) {
          const st = await fs.stat(full);
          total += st.size;
        }
      } catch {
        continue;
      }
    }
    return total;
  }
}
