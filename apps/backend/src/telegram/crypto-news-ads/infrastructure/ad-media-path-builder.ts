import { BaseMediaPathBuilder } from '@ingestion-service/media/core/base-media-path-builder';
import { createHash } from 'crypto';
import * as path from 'path';

/**
 * Path builder for crypto-news-ads media storage.
 *
 * Implements two storage patterns:
 * 1. Ad-specific: `crypto-news-ads/{adId}/{uuid}.{ext}` (per-ad media)
 * 2. Library: `crypto-news-ads-library/{contentHash}.{ext}` (shared library)
 */
export class AdMediaPathBuilder extends BaseMediaPathBuilder {
  constructor(baseDir: string) {
    super({ root: baseDir, recursive: true });
  }

  /**
   * Build path for ad-specific media: `crypto-news-ads/{adId}/{uuid}.{ext}`
   */
  buildAdMediaPath(adId: string, uuid: string, extension: string): string {
    const sanitizedAdId = this.sanitizeId(adId);
    const filename = `${uuid}${extension}`;
    return path.join(
      this.config.root,
      'crypto-news-ads',
      sanitizedAdId,
      filename,
    );
  }

  /**
   * Build path for library media using provided hash: `crypto-news-ads-library/{contentHash}.{ext}`
   */
  buildLibraryMediaPathFromHash(
    contentHash: string,
    extension: string,
  ): string {
    const filename = `${contentHash}${extension}`;
    return path.join(this.config.root, 'crypto-news-ads-library', filename);
  }

  /**
   * Build path for library media by computing hash: `crypto-news-ads-library/{computedHash}.{ext}`
   */
  buildLibraryMediaPath(buffer: Buffer, extension: string): string {
    const contentHash = this.computeContentHash(buffer);
    return this.buildLibraryMediaPathFromHash(contentHash, extension);
  }

  /**
   * Compute SHA256 hash of buffer content (first 16 hex chars)
   */
  private computeContentHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  }

  /**
   * BaseMediaPathBuilder abstract method implementations
   * (required by base class, delegates to specific methods)
   */
  buildMediaPath(..._args: unknown[]): string {
    throw new Error('Use buildAdMediaPath or buildLibraryMediaPath instead');
  }

  getMediaDirectory(adId: string): string {
    const sanitizedAdId = this.sanitizeId(adId);
    return path.join(this.config.root, 'crypto-news-ads', sanitizedAdId);
  }
}
