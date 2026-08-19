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

/** Image formats the storage adapter can persist and the API can serve. */
const ALLOWED_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

/**
 * Reuses 1..10 media-library images as an ad album (clone-on-reuse).
 *
 * Takes library entries (persisted once, deduped by content hash) and
 * clones each one's bytes into a fresh ad media row + file, so the ad
 * never shares file paths with the canonical library copies. Replace
 * semantics (draft D8): when the ad already references album media, the
 * OLD media rows + files are cleaned up only AFTER the new files, the
 * new media rows, and the new ad snapshot have all been persisted — a
 * failure at any earlier point leaves the previous album intact.
 *
 * All library ids are resolved and validated BEFORE any write, so a
 * missing id or non-image buffer fails without leaving partial rows.
 */
@Injectable()
export class ReuseLibraryImagesUseCase {
  public constructor(
    private readonly adRepo: AdRepository,
    private readonly adMediaRepo: AdMediaRepository,
    private readonly libraryRepo: AdMediaLibraryRepository,
    private readonly storage: AdMediaStoragePort,
  ) {}

  public async execute(args: {
    adId: string;
    libraryMediaIds: string[];
  }): Promise<AdView> {
    const ad = await this.adRepo.findById(args.adId);
    if (!ad) {
      throw new DomainError(ErrorCode.NOT_FOUND, `Ad ${args.adId} not found`);
    }

    // Resolve + validate every library item before writing anything.
    const resolved: Array<{
      lib: AdMediaLibraryRecord;
      buffer: Buffer;
      mimeType: string;
    }> = [];
    for (const id of args.libraryMediaIds) {
      const lib = await this.libraryRepo.findById(id);
      if (!lib) {
        throw new DomainError(
          ErrorCode.NOT_FOUND,
          `Library media ${id} not found`,
        );
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
      // Re-sniff from the buffer (a trusted non-octet-stream library MIME
      // is honored; anything unresolvable falls back to octet-stream and
      // is rejected here).
      const mimeType = detectMediaMimeType(lib.filePath, lib.mimeType, buffer);
      if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
        throw new DomainError(
          ErrorCode.VALIDATION,
          'only image files are allowed',
        );
      }
      resolved.push({ lib, buffer, mimeType });
    }

    // Capture the previous album media rows (if any) BEFORE writing
    // anything. Old files are removed only after the new saves succeed.
    const oldMedia: AdMediaRecord[] = [];
    if (ad.albumMediaIds !== null) {
      for (const id of ad.albumMediaIds) {
        const media = await this.adMediaRepo.findById(id);
        if (media) {
          oldMedia.push(media);
        }
      }
    }

    const newIds: string[] = [];
    for (const { buffer, mimeType } of resolved) {
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
      newIds.push(record.id);
    }

    // `applyAdPatch` preserves the ad's format fields and enforces the
    // per-format media invariant on the resulting ad.
    const updatedAd = applyAdPatch(ad, { albumMediaIds: newIds }, new Date());
    await this.adRepo.save(updatedAd);

    for (const media of oldMedia) {
      await this.storage.remove(media.filePath);
      await this.adMediaRepo.delete(media.id);
    }

    return toAdView(updatedAd);
  }
}
