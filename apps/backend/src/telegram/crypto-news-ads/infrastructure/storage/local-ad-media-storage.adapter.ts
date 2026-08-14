import { promises as fs } from 'fs';
import * as path from 'path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from 'shared/common/config/app.config';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { AdMediaStoragePort } from 'telegram/crypto-news-ads/application/ports/ad-media-storage.port';

/**
 * Maps a sniffed media MIME type to its on-disk extension. Anything
 * outside the supported image/video formats falls back to `.bin` (the
 * upload use cases reject such MIMEs before ever reaching us).
 *
 * `video/mp4` is the ONLY video format accepted: Telegram plays inline
 * only MP4 (H.264) — QuickTime/MKV fall back to Document (finding #4).
 */
const MIME_TO_EXT: Readonly<Record<string, string>> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
};

const DEFAULT_EXT = '.bin';

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
    if (buffer.byteLength > MAX_MEDIA_BYTES) {
      throw new DomainError(ErrorCode.VALIDATION, 'file exceeds 50 MB');
    }
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

  public async storeLibraryFile(
    buffer: Buffer,
    mimeType: string,
    contentHash: string,
  ): Promise<{ relativePath: string; size: number }> {
    if (buffer.byteLength > MAX_MEDIA_BYTES) {
      throw new DomainError(ErrorCode.VALIDATION, 'file exceeds 50 MB');
    }
    const id = contentHash;
    const ext = MIME_TO_EXT[mimeType] ?? DEFAULT_EXT;
    const targetDir = path.join(this.root, 'crypto-news-ads-library');
    await fs.mkdir(targetDir, { recursive: true });
    const fileName = `${id}${ext}`;
    await fs.writeFile(path.join(targetDir, fileName), buffer);
    return {
      relativePath: `crypto-news-ads-library/${fileName}`,
      size: buffer.byteLength,
    };
  }

  public async readFile(relativePath: string): Promise<Buffer> {
    const resolvedRoot = path.resolve(this.root);
    const target = path.resolve(this.root, relativePath);
    if (!target.startsWith(resolvedRoot + path.sep)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `media path escapes the uploads root: ${relativePath}`,
      );
    }
    return fs.readFile(target);
  }
}
