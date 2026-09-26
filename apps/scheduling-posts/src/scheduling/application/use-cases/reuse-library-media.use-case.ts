import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ScheduledAdRepository } from '../../domain/ports/scheduled-ad.repository';
import { AdMediaLibraryRepository } from '../../domain/ports/ad-media-library.repository';
import { ScheduledAd } from '../../domain/scheduled-ad.entity';
import {
  toScheduledAdView,
  type ScheduledAdView,
} from '../mappers/scheduling.mapper';

/**
 * Attaches shared-library assets to a scheduling post without
 * re-uploading bytes. One library id sets the post image; several
 * set the post album (format flips to album automatically). The
 * library rows are never mutated — the post only references them.
 */
@Injectable()
export class ReuseLibraryMediaUseCase {
  public constructor(
    private readonly adRepo: ScheduledAdRepository,
    private readonly libraryRepo: AdMediaLibraryRepository,
  ) {}

  public async execute(args: {
    adId: string;
    libraryMediaIds: ReadonlyArray<string>;
  }): Promise<ScheduledAdView> {
    if (args.libraryMediaIds.length === 0) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'at least one library media id is required',
      );
    }
    const ad = await this.adRepo.findById(args.adId);
    if (!ad) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `Scheduled post ${args.adId} not found`,
      );
    }
    for (const libraryMediaId of args.libraryMediaIds) {
      const hit = await this.libraryRepo.findById(libraryMediaId);
      if (!hit) {
        throw new DomainError(
          ErrorCode.NOT_FOUND,
          `Library media ${libraryMediaId} not found`,
        );
      }
    }
    const single = args.libraryMediaIds.length === 1;
    const updated = ScheduledAd.fromSnapshot({
      id: ad.id,
      name: ad.name,
      body: ad.body,
      format: single ? ad.format : 'album',
      imageMediaId: single ? args.libraryMediaIds[0] : ad.imageMediaId,
      videoMediaId: ad.videoMediaId,
      albumMediaIds: single ? ad.albumMediaIds : [...args.libraryMediaIds],
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
    updated.validateInvariants();
    await this.adRepo.save(updated);
    return toScheduledAdView(updated);
  }
}
