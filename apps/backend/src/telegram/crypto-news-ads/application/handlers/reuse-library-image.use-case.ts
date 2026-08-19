import * as crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { detectMediaMimeType } from 'shared/common/http/media-serving';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import {
  AdMediaRecord,
  AdMediaRepository,
} from 'telegram/crypto-news-ads/application/ports/ad-media.repository';
import { AdMediaStoragePort } from 'telegram/crypto-news-ads/application/ports/ad-media-storage.port';
import { AdMediaLibraryRepository } from 'telegram/crypto-news-ads/application/ports/ad-media-library.repository';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import {
  AdView,
  toAdView,
} from 'telegram/crypto-news-ads/application/mappers/ads.mapper';

/** Image formats the storage adapter can persist and the API can serve. */
const ALLOWED_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

/**
 * Reuses a media-library image as an ad attachment (clone-on-reuse).
 *
 * Takes a library entry (persisted once, deduped by content hash) and
 * clones its bytes into a fresh ad media row + file, so the ad never
 * shares a file path with the canonical library copy. Replace semantics
 * (draft D8): when the ad already references an image, the OLD media row
 * + file are cleaned up only AFTER the new file, the new media row, and
 * the new ad snapshot have all been persisted — a failure at any earlier
 * point leaves the previous image intact.
 *
 * MIME is re-sniffed from the buffer via `detectMediaMimeType`
 * (`shared/common/http/media-serving`) — the persisted library mimeType
 * is trusted only when it is not a generic octet-stream, and the actual
 * buffer bytes are never assumed safe.
 */
@Injectable()
export class ReuseLibraryImageUseCase {
  public constructor(
    private readonly adRepo: AdRepository,
    private readonly adMediaRepo: AdMediaRepository,
    private readonly libraryRepo: AdMediaLibraryRepository,
    private readonly storage: AdMediaStoragePort,
  ) {}

  public async execute(args: {
    adId: string;
    libraryMediaId: string;
  }): Promise<AdView> {
    const lib = await this.libraryRepo.findById(args.libraryMediaId);
    if (!lib) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `Library media ${args.libraryMediaId} not found`,
      );
    }

    const ad = await this.adRepo.findById(args.adId);
    if (!ad) {
      throw new DomainError(ErrorCode.NOT_FOUND, `Ad ${args.adId} not found`);
    }

    let buffer: Buffer;
    try {
      buffer = await this.storage.readFile(lib.filePath);
    } catch (error) {
      if (
        error !== null &&
        typeof error === 'object' &&
        (error as { code?: unknown }).code === 'ENOENT'
      ) {
        throw new DomainError(
          ErrorCode.NOT_FOUND,
          'library file missing on disk',
        );
      }
      throw error;
    }

    // Re-sniff from the buffer (a trusted non-octet-stream library MIME is
    // honored; anything unresolvable falls back to octet-stream and is
    // rejected here).
    const mimeType = detectMediaMimeType(lib.filePath, lib.mimeType, buffer);
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'only image files are allowed',
      );
    }

    // Capture the previous media row (if any) BEFORE writing anything.
    // The old file is removed only after the new save succeeds.
    let oldMedia: AdMediaRecord | null = null;
    if (ad.imageMediaId !== null) {
      oldMedia = await this.adMediaRepo.findById(ad.imageMediaId);
    }

    const stored = await this.storage.store(args.adId, buffer, mimeType);

    const record: AdMediaRecord = {
      id: crypto.randomUUID(),
      adId: args.adId,
      filePath: stored.relativePath,
      mimeType,
      fileSize: stored.size,
      createdAt: new Date(),
    };
    await this.adMediaRepo.save(record);

    // The domain `Ad` is immutable — rebuild it with the new media id,
    // preserving the ad's format fields (omitting them would let
    // `fromSnapshot` reset a photo/video/album ad back to `text`).
    const updatedAd = Ad.fromSnapshot({
      id: ad.id,
      name: ad.name,
      body: ad.body,
      imageMediaId: record.id,
      format: ad.format,
      videoMediaId: ad.videoMediaId,
      albumMediaIds: ad.albumMediaIds,
      enabled: ad.enabled,
      order: ad.order,
      timesPublished: ad.timesPublished,
      consecutiveFailures: ad.consecutiveFailures,
      lastPublishedAt: ad.lastPublishedAt,
      expiresAt: ad.expiresAt,
      expirationAction: ad.expirationAction,
      createdAt: ad.createdAt,
      updatedAt: ad.updatedAt,
    });
    updatedAd.validateInvariants();
    await this.adRepo.save(updatedAd);

    if (oldMedia) {
      await this.storage.remove(oldMedia.filePath);
      await this.adMediaRepo.delete(oldMedia.id);
    }

    return toAdView(updatedAd);
  }
}
