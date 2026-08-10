import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { AdMediaRepository } from 'telegram/crypto-news-ads/application/ports/ad-media.repository';
import { AdMediaStoragePort } from 'telegram/crypto-news-ads/application/ports/ad-media-storage.port';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import {
  AdView,
  toAdView,
} from 'telegram/crypto-news-ads/application/mappers/ads.mapper';

/**
 * Removes the image attachment of a crypto-news ad.
 *
 * Idempotent: clearing an ad that already has `imageMediaId === null`
 * is a no-op that returns the ad unchanged. When an image is present,
 * the on-disk file is removed, the media row is deleted, and the ad is
 * rebuilt with `imageMediaId: null` and saved.
 */
@Injectable()
export class ClearAdImageUseCase {
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
    if (ad.imageMediaId === null) {
      return toAdView(ad);
    }

    const media = await this.adMediaRepo.findById(ad.imageMediaId);
    if (media) {
      await this.storage.remove(media.filePath);
      await this.adMediaRepo.delete(media.id);
    }

    const clearedAd = Ad.fromSnapshot({
      id: ad.id,
      name: ad.name,
      body: ad.body,
      imageMediaId: null,
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
    const saved = await this.adRepo.save(clearedAd);
    return toAdView(saved);
  }
}
