import * as crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { detectMediaMimeType } from 'shared/common/http/media-serving';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import {
  AdMediaRecord,
  AdMediaRepository,
} from 'telegram/crypto-news-ads/application/ports/ad-media.repository';
import { AdMediaStoragePort } from 'telegram/crypto-news-ads/application/ports/ad-media-storage.port';
import {
  AdMediaLibraryRecord,
  AdMediaLibraryRepository,
} from 'telegram/crypto-news-ads/application/ports/ad-media-library.repository';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import {
  AdView,
  applyAdPatch,
  toAdView,
} from 'telegram/crypto-news-ads/application/mappers/ads.mapper';

/** Hard cap on a single ad video upload (bytes) — Bot API local upload limit. */
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

/**
 * Video formats Telegram plays inline. Only MP4 (H.264) is accepted —
 * QuickTime/MKV fall back to Document in Telegram (finding #4).
 */
const ALLOWED_VIDEO_MIME_TYPES: ReadonlySet<string> = new Set(['video/mp4']);

/**
 * Uploads (or replaces) the video attachment of a crypto-news ad.
 *
 * Replace semantics (draft D8): when the ad already references a video,
 * the OLD media row + file are cleaned up only AFTER the new file, the
 * new media row, and the new ad snapshot have all been persisted — a
 * failure at any earlier point leaves the previous video intact.
 *
 * MIME detection is done by sniffing the buffer's magic bytes via
 * `detectMediaMimeType` (`shared/common/http/media-serving`) — a
 * client-supplied mimetype is never trusted. Only `video/mp4` passes:
 * Telegram reproduces inline only MP4/H.264.
 */
@Injectable()
export class UploadAdVideoUseCase {
  public constructor(
    private readonly adRepo: AdRepository,
    private readonly adMediaRepo: AdMediaRepository,
    private readonly storage: AdMediaStoragePort,
    private readonly libraryRepo: AdMediaLibraryRepository,
  ) {}

  public async execute(args: {
    adId: string;
    buffer: Buffer;
    originalFileName?: string | null;
  }): Promise<AdView> {
    if (!args.buffer || args.buffer.byteLength === 0) {
      throw new DomainError(ErrorCode.VALIDATION, 'empty file');
    }
    if (args.buffer.byteLength > MAX_VIDEO_BYTES) {
      throw new DomainError(ErrorCode.VALIDATION, 'file exceeds 50 MB');
    }

    // Sniff from the buffer only: no DB value, no extension fallback.
    // Non-MP4 video buffers resolve to `video/quicktime`,
    // `application/octet-stream` (MKV) or another MIME and are rejected.
    const mimeType = detectMediaMimeType('', null, args.buffer);
    if (!ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'only MP4 (H.264) video files are allowed — Telegram plays inline only MP4/H.264',
      );
    }

    // Library registration runs BEFORE the ad existence check: a fresh
    // upload is persisted once in the shared library (deduped by sha256),
    // and a library write failure propagates like any other IO error.
    const contentHash = crypto
      .createHash('sha256')
      .update(args.buffer)
      .digest('hex');
    const libraryHit = await this.libraryRepo.findByContentHash(contentHash);
    if (!libraryHit) {
      const libStored = await this.storage.storeLibraryFile(
        args.buffer,
        mimeType,
        contentHash,
      );
      const libraryRecord: AdMediaLibraryRecord = {
        id: crypto.randomUUID(),
        filePath: libStored.relativePath,
        contentHash,
        originalFileName: args.originalFileName ?? null,
        mimeType,
        fileSize: libStored.size,
        createdAt: new Date(),
      };
      await this.libraryRepo.save(libraryRecord);
    }

    const ad = await this.adRepo.findById(args.adId);
    if (!ad) {
      throw new DomainError(ErrorCode.NOT_FOUND, `Ad ${args.adId} not found`);
    }

    // Capture the previous media row (if any) BEFORE writing anything.
    // The old file is removed only after the new save succeeds.
    let oldMedia: AdMediaRecord | null = null;
    if (ad.videoMediaId !== null) {
      oldMedia = await this.adMediaRepo.findById(ad.videoMediaId);
    }

    const stored = await this.storage.store(args.adId, args.buffer, mimeType);

    const record: AdMediaRecord = {
      id: crypto.randomUUID(),
      adId: args.adId,
      filePath: stored.relativePath,
      mimeType,
      fileSize: stored.size,
      createdAt: new Date(),
    };
    await this.adMediaRepo.save(record);

    // `applyAdPatch` preserves the ad's format fields and enforces the
    // per-format media invariant on the resulting ad.
    const updatedAd = applyAdPatch(ad, { videoMediaId: record.id }, new Date());
    await this.adRepo.save(updatedAd);

    if (oldMedia) {
      await this.storage.remove(oldMedia.filePath);
      await this.adMediaRepo.delete(oldMedia.id);
    }

    return toAdView(updatedAd);
  }
}
