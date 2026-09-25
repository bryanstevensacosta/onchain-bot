import * as crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ScheduledAdRepository } from '../../domain/ports/scheduled-ad.repository';
import {
  ScheduledAdMediaRepository,
  type ScheduledAdMediaRecord,
} from '../../domain/ports/scheduled-ad-media.repository';
import { AdMediaLibraryRepository } from '../../domain/ports/ad-media-library.repository';
import { SchedulingMediaStoragePort } from '../../domain/ports/scheduling-media-storage.port';
import { AdMediaLibraryEntry } from '../../domain/ad-media-library-entry.entity';
import { ScheduledAd } from '../../domain/scheduled-ad.entity';
import {
  extensionForMimeType,
  sniffSchedulingMimeType,
} from '../services/scheduling-media-sniffer';
import {
  toScheduledAdView,
  type ScheduledAdView,
} from '../mappers/scheduling.mapper';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const ALLOWED_IMAGE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

const ALLOWED_VIDEO_MIME_TYPES: ReadonlySet<string> = new Set(['video/mp4']);

/**
 * Uploads (or replaces) the image/video attachment of a scheduling
 * post, moved from the backend ads upload use-cases.
 *
 * Replace semantics: when the post already references media of this
 * kind, the OLD row + file are removed only AFTER the new file, the
 * new row, and the new post snapshot have all persisted — a failure
 * at any earlier point leaves the previous media intact.
 *
 * Every upload is also registered once in the shared library
 * (deduped by sha256); a missing post 404s AFTER the library write
 * so the bytes are never lost (the operator can reuse them).
 */
@Injectable()
export class UploadScheduledAdMediaUseCase {
  public constructor(
    private readonly adRepo: ScheduledAdRepository,
    private readonly adMediaRepo: ScheduledAdMediaRepository,
    private readonly libraryRepo: AdMediaLibraryRepository,
    private readonly storage: SchedulingMediaStoragePort,
  ) {}

  public async execute(args: {
    adId: string;
    kind: 'image' | 'video';
    buffer: Buffer;
    originalFileName?: string | null;
  }): Promise<ScheduledAdView> {
    if (!args.buffer || args.buffer.byteLength === 0) {
      throw new DomainError(ErrorCode.VALIDATION, 'empty file');
    }
    const cap = args.kind === 'image' ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
    if (args.buffer.byteLength > cap) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        args.kind === 'image' ? 'file exceeds 10 MB' : 'file exceeds 50 MB',
      );
    }
    const mimeType = sniffSchedulingMimeType(args.buffer);
    const allowed =
      args.kind === 'image'
        ? ALLOWED_IMAGE_MIME_TYPES
        : ALLOWED_VIDEO_MIME_TYPES;
    if (!allowed.has(mimeType)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        args.kind === 'image'
          ? 'only image files are allowed'
          : 'only video files are allowed',
      );
    }
    void extensionForMimeType(mimeType);

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
      await this.libraryRepo.save(
        AdMediaLibraryEntry.create({
          filePath: libStored.relativePath,
          contentHash,
          originalFileName: args.originalFileName ?? null,
          mimeType,
          fileSize: libStored.size,
        }),
      );
    }

    const ad = await this.adRepo.findById(args.adId);
    if (!ad) {
      throw new DomainError(
        ErrorCode.NOT_FOUND,
        `Scheduled post ${args.adId} not found`,
      );
    }

    const previousMediaId =
      args.kind === 'image' ? ad.imageMediaId : ad.videoMediaId;
    let oldMedia: ScheduledAdMediaRecord | null = null;
    if (previousMediaId !== null) {
      oldMedia = await this.adMediaRepo.findById(previousMediaId);
    }

    const stored = await this.storage.store(args.adId, args.buffer, mimeType);
    const record: ScheduledAdMediaRecord = {
      id: crypto.randomUUID(),
      adId: args.adId,
      filePath: stored.relativePath,
      mimeType,
      fileSize: stored.size,
      createdAt: new Date(),
    };
    await this.adMediaRepo.save(record);

    // The domain post is immutable: rebuild with the new media id,
    // carrying the format fields over explicitly so a photo/video
    // post is never downgraded to text by an upload.
    const updated = ScheduledAd.fromSnapshot({
      id: ad.id,
      name: ad.name,
      body: ad.body,
      format: ad.format,
      imageMediaId: args.kind === 'image' ? record.id : ad.imageMediaId,
      videoMediaId: args.kind === 'video' ? record.id : ad.videoMediaId,
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
    updated.validateInvariants();
    await this.adRepo.save(updated);

    if (oldMedia) {
      await this.storage.remove(oldMedia.filePath);
      await this.adMediaRepo.delete(oldMedia.id);
    }
    return toScheduledAdView(updated);
  }
}
