import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { SchedulingMediaStoragePort } from '../../domain/ports/scheduling-media-storage.port';
import { extensionForMimeType } from '../../application/services/scheduling-media-sniffer';

/**
 * Disk adapter for `SchedulingMediaStoragePort` (Opcion B: the
 * library lives under the feed-publisher app root).
 *
 * Per-post files land under `<root>/ads/<adId>/<uuid>.<ext>`, shared
 * library files under `<root>/ads-library/<contentHash>.<ext>`, and
 * only RELATIVE paths ever leave this adapter. Root resolves from
 * `FEED_PUBLISHER_UPLOADS_ROOT` (default `<cwd>/uploads`).
 */
@Injectable()
export class LocalSchedulingMediaStorageAdapter extends SchedulingMediaStoragePort {
  private readonly uploadsRoot: string;

  public constructor(config?: ConfigService) {
    super();
    const fromEnv = process.env.FEED_PUBLISHER_UPLOADS_ROOT;
    const fromConfig = config?.get<string>('FEED_PUBLISHER_UPLOADS_ROOT');
    this.uploadsRoot =
      fromEnv ?? fromConfig ?? path.join(process.cwd(), 'uploads');
  }

  public async store(
    adId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ relativePath: string; size: number }> {
    const safeAdId = LocalSchedulingMediaStorageAdapter.sanitizeSegment(adId);
    const filename = `${crypto.randomUUID()}${extensionForMimeType(mimeType)}`;
    const absolutePath = path.join(this.uploadsRoot, 'ads', safeAdId, filename);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);
    return {
      relativePath: this.toRelativePath(absolutePath),
      size: buffer.byteLength,
    };
  }

  public async storeLibraryFile(
    buffer: Buffer,
    mimeType: string,
    contentHash: string,
  ): Promise<{ relativePath: string; size: number }> {
    const safeHash =
      LocalSchedulingMediaStorageAdapter.sanitizeSegment(contentHash);
    const filename = `${safeHash}${extensionForMimeType(mimeType)}`;
    const absolutePath = path.join(this.uploadsRoot, 'ads-library', filename);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, buffer);
    return {
      relativePath: this.toRelativePath(absolutePath),
      size: buffer.byteLength,
    };
  }

  public async remove(relativePath: string): Promise<void> {
    const absolutePath = this.resolveAndValidatePath(relativePath);
    try {
      await fs.unlink(absolutePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw err;
    }
  }

  public async readFile(relativePath: string): Promise<Buffer> {
    const absolutePath = this.resolveAndValidatePath(relativePath);
    return fs.readFile(absolutePath);
  }

  private toRelativePath(absolutePath: string): string {
    const resolvedRoot = path.resolve(this.uploadsRoot);
    const resolvedPath = path.resolve(absolutePath);
    if (!resolvedPath.startsWith(resolvedRoot + path.sep)) {
      throw new Error(`Path ${absolutePath} is not within uploads root`);
    }
    return resolvedPath.slice(resolvedRoot.length + path.sep.length);
  }

  private resolveAndValidatePath(relativePath: string): string {
    if (path.isAbsolute(relativePath)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `media path escapes the uploads root: ${relativePath}`,
      );
    }
    const resolvedRoot = path.resolve(this.uploadsRoot);
    const resolvedPath = path.resolve(this.uploadsRoot, relativePath);
    if (!resolvedPath.startsWith(resolvedRoot + path.sep)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `media path escapes the uploads root: ${relativePath}`,
      );
    }
    return resolvedPath;
  }

  private static sanitizeSegment(raw: string): string {
    const cleaned = raw.replace(/[^a-zA-Z0-9-_]/g, '_');
    if (cleaned === '' || cleaned === '.' || cleaned === '..') {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `invalid path segment: ${raw}`,
      );
    }
    return cleaned;
  }
}
