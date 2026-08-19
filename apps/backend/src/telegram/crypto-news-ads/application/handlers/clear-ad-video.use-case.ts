import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { AdMediaRepository } from 'telegram/crypto-news-ads/application/ports/ad-media.repository';
import { AdMediaStoragePort } from 'telegram/crypto-news-ads/application/ports/ad-media-storage.port';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import {
  AdView,
  applyAdPatch,
  toAdView,
} from 'telegram/crypto-news-ads/application/mappers/ads.mapper';

/**
 * Removes the video attachment of a crypto-news ad.
 *
 * Idempotent: clearing an ad that already has `videoMediaId === null`
 * is a no-op that returns the ad unchanged. When a video is present,
 * the on-disk file is removed, the media row is deleted, and the ad is
 * rebuilt with `videoMediaId: null` (explicit-null clears via
 * `applyAdPatch`) and saved.
 */
@Injectable()
export class ClearAdVideoUseCase {
  public constructor(
    private readonly adRepo: AdRepository,
    private readonly adMediaRepo: AdMediaRepository,
    private readonly storage: AdMediaStoragePort,
  ) {}

  public async execute(adId: string): Promise<AdView> {
    const ad = await this.adRepo.findById(adId);
    if (!ad) {
      throw new DomainError(ErrorCode.NOT_FOUND, `Ad ${adId} not found`);
    }
    if (ad.videoMediaId === null) {
      return toAdView(ad);
    }

    // Validate the patch BEFORE touching the file/row: clearing the video
    // of a video-format ad violates the per-format invariant and must
    // fail without deleting anything.
    const clearedAd = applyAdPatch(ad, { videoMediaId: null }, new Date());

    const media = await this.adMediaRepo.findById(ad.videoMediaId);
    if (media) {
      await this.storage.remove(media.filePath);
      await this.adMediaRepo.delete(media.id);
    }

    const saved = await this.adRepo.save(clearedAd);
    return toAdView(saved);
  }
}
