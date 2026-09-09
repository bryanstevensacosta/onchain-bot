import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';
import type { AppConfig } from 'shared/common/config/app.config';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { AdMediaStoragePort } from 'telegram/crypto-news-ads/application/ports/ad-media-storage.port';
import { BaseFileSystemAdapter } from '@ingestion-service/media/core/base-file-system-adapter';
import { MimeTypeResolver } from '@ingestion-service/media/utils/mime-type-resolver';
import { AdMediaPathBuilder } from '../ad-media-path-builder';

/**
 * Hard cap on any single media write (bytes) — the Bot API local-upload
 * limit for videos (50 MB). Images are capped tighter (10 MB) by the
 * upload use cases; this is the storage-level defensive ceiling.
 */
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

/**
 * Disk adapter for {@link AdMediaStoragePort}.
 *
 * Writes ad images under `<uploadsRoot>/crypto-news-ads/<adId>/<uuid>.<ext>`
 * and returns the path RELATIVE to the uploads root (the only form the
 * application layer and the `crypto_news_ad_media` table ever see). The
 * uploads root is resolved once from `app.uploadsRoot` (env
 * `UPLOADS_ROOT`, default `<cwd>/uploads` — see `app.config.ts:227,536`)
 * so every write lands inside the configured volume.
 *
 * `remove` only ever resolves RELATIVE paths (the ones this adapter
 * returns): an absolute input or a `..`-escaping one throws VALIDATION
 * rather than touching anything outside the uploads root.
 *
 * Extends {@link BaseFileSystemAdapter} for shared file operations.
 */
@Injectable()
export class LocalAdMediaStorageAdapter extends AdMediaStoragePort {
  private readonly fsAdapter: BaseFileSystemAdapter;
  private readonly pathBuilder: AdMediaPathBuilder;
  private readonly uploadsRoot: string;

  public constructor(config: ConfigService) {
    super();
    const appCfg = config.getOrThrow<AppConfig>('app');
    this.uploadsRoot = appCfg.uploadsRoot;

    // Create concrete instance for file I/O
    this.fsAdapter = new (class extends BaseFileSystemAdapter {})();
    this.pathBuilder = new AdMediaPathBuilder(this.uploadsRoot);
  }

  public async store(
    adId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ relativePath: string; size: number }> {
    if (buffer.byteLength > MAX_MEDIA_BYTES) {
      throw new DomainError(ErrorCode.VALIDATION, 'file exceeds 50 MB');
    }

    const uuid = crypto.randomUUID();
    const extension = MimeTypeResolver.getExtensionFromMimeType(mimeType);
    const absolutePath = this.pathBuilder.buildAdMediaPath(
      adId,
      uuid,
      extension,
    );

    await this.fsAdapter.write(absolutePath, buffer);

    // Extract relative path (strip uploads root prefix)
    const relativePath = this.extractRelativePath(absolutePath);
    return {
      relativePath,
      size: buffer.byteLength,
    };
  }

  public async remove(relativePath: string): Promise<void> {
    const absolutePath = this.resolveAndValidatePath(relativePath);
    await this.fsAdapter.delete(absolutePath);
  }

  public async storeLibraryFile(
    buffer: Buffer,
    mimeType: string,
    contentHash: string,
  ): Promise<{ relativePath: string; size: number }> {
    if (buffer.byteLength > MAX_MEDIA_BYTES) {
      throw new DomainError(ErrorCode.VALIDATION, 'file exceeds 50 MB');
    }

    const extension = MimeTypeResolver.getExtensionFromMimeType(mimeType);
    const absolutePath = this.pathBuilder.buildLibraryMediaPathFromHash(
      contentHash,
      extension,
    );

    await this.fsAdapter.write(absolutePath, buffer);

    // Extract relative path (strip uploads root prefix)
    const relativePath = this.extractRelativePath(absolutePath);
    return {
      relativePath,
      size: buffer.byteLength,
    };
  }

  public async readFile(relativePath: string): Promise<Buffer> {
    const absolutePath = this.resolveAndValidatePath(relativePath);
    return this.fsAdapter.read(absolutePath);
  }

  /**
   * Extract relative path by removing uploads root prefix.
   *
   * @param absolutePath - Full path within uploads root
   * @returns Relative path (e.g., 'crypto-news-ads/abc123/file.jpg')
   */
  private extractRelativePath(absolutePath: string): string {
    const resolvedRoot = path.resolve(this.uploadsRoot);
    const resolvedPath = path.resolve(absolutePath);

    if (!resolvedPath.startsWith(resolvedRoot + path.sep)) {
      throw new Error(`Path ${absolutePath} is not within uploads root`);
    }

    // Strip root prefix + separator
    return resolvedPath.slice(resolvedRoot.length + path.sep.length);
  }

  /**
   * Resolve relative path to absolute and validate it's within uploads root.
   *
   * Prevents path traversal attacks by validating the resolved path.
   *
   * @param relativePath - Relative path from database
   * @returns Absolute path within uploads root
   * @throws DomainError if path escapes uploads root
   */
  private resolveAndValidatePath(relativePath: string): string {
    // Reject absolute paths immediately
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
}
