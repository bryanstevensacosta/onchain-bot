import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ScheduledAdRepository } from '../../domain/ports/scheduled-ad.repository';
import { ScheduledAdMediaRepository } from '../../domain/ports/scheduled-ad-media.repository';
import { SchedulingMediaStoragePort } from '../../domain/ports/scheduling-media-storage.port';
import { ScheduledAd } from '../../domain/scheduled-ad.entity';
import {
  toScheduledAdView,
  type ScheduledAdView,
} from '../mappers/scheduling.mapper';

/**
 * Clears the image/video attachment of a scheduling post. Cleared
 * slots become null; clearing an already-empty slot is a no-op that
 * returns the current view. A post whose format requires the cleared
 * media (photo without image, video without video) is downgraded to
 * text so the catalog never holds an invalid post.
 */
@Injectable()
export class ClearScheduledAdMediaUseCase {
  public constructor(
    private readonly adRepo: ScheduledAdRepository,
    private readonly adMediaRepo: ScheduledAdMediaRepository,
    private readonly storage: SchedulingMediaStoragePort,
  ) {}

  public async execute(
    adId: string,
    kind: 'image' | 'video',
  ): Promise<ScheduledAdView> {
    const ad = await this.adRepo.findById(adId);
    if (!ad) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `Scheduled post ${adId} not found`,
      );
    }
    const mediaId = kind === 'image' ? ad.imageMediaId : ad.videoMediaId;
    let updated = ad;
    if (mediaId !== null) {
      const media = await this.adMediaRepo.findById(mediaId);
      if (media) {
        await this.storage.remove(media.filePath);
        await this.adMediaRepo.delete(media.id);
      }
      const needsDowngrade =
        (kind === 'image' && ad.format === 'photo') ||
        (kind === 'video' && ad.format === 'video');
      updated = ScheduledAd.fromSnapshot({
        id: ad.id,
        name: ad.name,
        body: ad.body,
        format: needsDowngrade ? 'text' : ad.format,
        imageMediaId: kind === 'image' ? null : ad.imageMediaId,
        videoMediaId: kind === 'video' ? null : ad.videoMediaId,
        albumMediaIds: ad.albumMediaIds ? [...ad.albumMediaIds] : null,
        buttons: ad.buttons ? [...ad.buttons] : null,
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
      await this.adRepo.save(updated);
    }
    return toScheduledAdView(updated);
  }
}
