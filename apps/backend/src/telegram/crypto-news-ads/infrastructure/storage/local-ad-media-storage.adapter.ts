import { promises as fs } from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from 'shared/common/config/app.config';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { AdMediaStoragePort } from 'telegram/crypto-news-ads/application/ports/ad-media-storage.port';

/**
 * Maps a sniffed image MIME type to its on-disk extension. Anything
 * outside the four supported image formats falls back to `.bin` (the
 * upload use case rejects such MIMEs before ever reaching us).
 */
const MIME_TO_EXT: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const DEFAULT_EXT = '.bin';

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
 */
@Injectable()
export class LocalAdMediaStorageAdapter extends AdMediaStoragePort {
  private readonly root: string;

  public constructor(config: ConfigService) {
    super();
    const appCfg = config.getOrThrow<AppConfig>('app');
    this.root = appCfg.uploadsRoot;
  }

  public async store(
    adId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<{ relativePath: string; size: number }> {
    const id = crypto.randomUUID();
    const ext = MIME_TO_EXT[mimeType] ?? DEFAULT_EXT;
    const targetDir = path.join(this.root, 'crypto-news-ads', adId);
    await fs.mkdir(targetDir, { recursive: true });
    const fileName = `${id}${ext}`;
    await fs.writeFile(path.join(targetDir, fileName), buffer);
    return {
      relativePath: `crypto-news-ads/${adId}/${fileName}`,
      size: buffer.byteLength,
    };
  }

  public async remove(relativePath: string): Promise<void> {
    const resolvedRoot = path.resolve(this.root);
    const target = path.resolve(this.root, relativePath);
    if (!target.startsWith(resolvedRoot + path.sep)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `media path escapes the uploads root: ${relativePath}`,
      );
    }
    await fs.rm(target, { force: true });
  }
}
