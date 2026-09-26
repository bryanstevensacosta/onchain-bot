import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ScheduledAdRepository } from '../../domain/ports/scheduled-ad.repository';
import { ScheduledAdMediaRepository } from '../../domain/ports/scheduled-ad-media.repository';
import { SchedulingMediaStoragePort } from '../../domain/ports/scheduling-media-storage.port';
import { ScheduledAd } from '../../domain/scheduled-ad.entity';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { UploadScheduledAdMediaUseCase } from '../../application/use-cases/upload-scheduled-ad-media.use-case';
import { ClearScheduledAdMediaUseCase } from '../../application/use-cases/clear-scheduled-ad-media.use-case';
import { ReuseLibraryMediaUseCase } from '../../application/use-cases/reuse-library-media.use-case';
import {
  PublishScheduledAdNowUseCase,
  type PublishScheduledAdNowResult,
} from '../../application/use-cases/publish-scheduled-ad-now.use-case';
import {
  applyScheduledAdPatch,
  isUniqueViolation,
  toButtonsOrNull,
  toScheduledAdView,
  type ScheduledAdView,
} from '../../application/mappers/scheduling.mapper';
import {
  CreateScheduledAdDto,
  PublishScheduledAdNowDto,
  ReuseLibraryMediaDto,
  UpdateScheduledAdDto,
} from '../input/scheduling.input';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface UploadedSchedulingFile {
  readonly buffer: Buffer;
  readonly originalname: string;
}

/**
 * Scheduling-post catalog (`/api/scheduling/ads`, P36 naming):
 * CRUD + image/video upload+clear (`:id/image`, `:id/video`) + album
 * from the media library (`:id/reuse-library-media`) + immediate send
 * (`:id/publish-now` with `{ target }`, default telegram).
 *
 * Media serving lives in `SchedulingMediaController`
 * (`/api/scheduling/media…`). Bodies validated by the global
 * `ValidationPipe`. `ScheduledAd` is immutable — PATCH rebuilds via
 * `applyScheduledAdPatch`.
 */
@ApiTags('feed-publisher-scheduling')
@Controller('api/scheduling/ads')
export class SchedulingAdsController {
  public constructor(
    private readonly adRepo: ScheduledAdRepository,
    private readonly adMediaRepo: ScheduledAdMediaRepository,
    private readonly storage: SchedulingMediaStoragePort,
    private readonly uploadMediaUseCase: UploadScheduledAdMediaUseCase,
    private readonly clearMediaUseCase: ClearScheduledAdMediaUseCase,
    private readonly reuseLibraryMediaUseCase: ReuseLibraryMediaUseCase,
    private readonly publishNowUseCase: PublishScheduledAdNowUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List scheduling posts (catalog order)' })
  @ApiResponse({ status: 200, description: 'Scheduling posts' })
  public async list(): Promise<ReadonlyArray<ScheduledAdView>> {
    const ads = await this.adRepo.findAll();
    return ads.map(toScheduledAdView);
  }

  private static ensureAdId(id: string): void {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException(`Scheduled post ${id} not found`);
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create a scheduling post' })
  @ApiResponse({ status: 201, description: 'Scheduling post created' })
  public async create(
    @Body() dto: CreateScheduledAdDto,
  ): Promise<ScheduledAdView> {
    const existing = await this.adRepo.findAll();
    const nextOrder =
      existing.reduce((max, a) => Math.max(max, a.order), -1) + 1;
    const ad = ScheduledAd.create({
      name: dto.name,
      body: dto.body,
      order: nextOrder,
      format: dto.format,
      videoMediaId: dto.videoMediaId ?? null,
      albumMediaIds: dto.albumMediaIds ?? null,
      buttons: toButtonsOrNull(dto.buttons),
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      expirationAction: dto.expirationAction ?? 'disable',
    });
    try {
      const saved = await this.adRepo.save(ad);
      return toScheduledAdView(saved);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `Scheduled post name already exists: ${dto.name}`,
        );
      }
      throw err;
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Patch a scheduling post' })
  @ApiResponse({ status: 200, description: 'Scheduling post updated' })
  public async update(
    @Param('id') id: string,
    @Body() dto: UpdateScheduledAdDto,
  ): Promise<ScheduledAdView> {
    SchedulingAdsController.ensureAdId(id);
    const existing = await this.adRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Scheduled post ${id} not found`);
    }
    const expiresAt =
      dto.expiresAt === undefined
        ? undefined
        : dto.expiresAt === null
          ? null
          : new Date(dto.expiresAt);
    let updated: ScheduledAd;
    try {
      updated = applyScheduledAdPatch(
        existing,
        {
          ...dto,
          expiresAt,
          buttons:
            dto.buttons !== undefined
              ? toButtonsOrNull(dto.buttons)
              : undefined,
        },
        new Date(),
      );
    } catch (err) {
      if (err instanceof DomainError && err.code === ErrorCode.CONFLICT) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
    try {
      const saved = await this.adRepo.save(updated);
      return toScheduledAdView(saved);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `Scheduled post name already exists: ${dto.name ?? existing.name}`,
        );
      }
      throw err;
    }
  }

  @Post(':id/image')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @ApiOperation({ summary: 'Upload/replace the post image (10 MB max)' })
  public async uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: UploadedSchedulingFile,
  ): Promise<ScheduledAdView> {
    SchedulingAdsController.ensureAdId(id);
    return this.uploadMediaUseCase.execute({
      adId: id,
      kind: 'image',
      buffer: file.buffer,
      originalFileName: file.originalname,
    });
  }

  @Delete(':id/image')
  @ApiOperation({ summary: 'Clear the post image' })
  public async clearImage(@Param('id') id: string): Promise<ScheduledAdView> {
    SchedulingAdsController.ensureAdId(id);
    return this.clearMediaUseCase.execute(id, 'image');
  }

  @Post(':id/video')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }),
  )
  @ApiOperation({ summary: 'Upload/replace the post video (50 MB max)' })
  public async uploadVideo(
    @Param('id') id: string,
    @UploadedFile() file: UploadedSchedulingFile,
  ): Promise<ScheduledAdView> {
    SchedulingAdsController.ensureAdId(id);
    return this.uploadMediaUseCase.execute({
      adId: id,
      kind: 'video',
      buffer: file.buffer,
      originalFileName: file.originalname,
    });
  }

  @Delete(':id/video')
  @ApiOperation({ summary: 'Clear the post video' })
  public async clearVideo(@Param('id') id: string): Promise<ScheduledAdView> {
    SchedulingAdsController.ensureAdId(id);
    return this.clearMediaUseCase.execute(id, 'video');
  }

  @Post(':id/reuse-library-media')
  @ApiOperation({ summary: 'Attach shared-library assets to the post' })
  public async reuseLibraryMedia(
    @Param('id') id: string,
    @Body() dto: ReuseLibraryMediaDto,
  ): Promise<ScheduledAdView> {
    SchedulingAdsController.ensureAdId(id);
    return this.reuseLibraryMediaUseCase.execute({
      adId: id,
      libraryMediaIds: dto.libraryMediaIds,
    });
  }

  @Post(':id/publish-now')
  @ApiOperation({ summary: 'Immediately send the post to a target' })
  public async publishNow(
    @Param('id') id: string,
    @Body() dto: PublishScheduledAdNowDto,
  ): Promise<PublishScheduledAdNowResult> {
    SchedulingAdsController.ensureAdId(id);
    const ad = await this.adRepo.findById(id);
    if (!ad) {
      throw new NotFoundException(`Scheduled post ${id} not found`);
    }
    return this.publishNowUseCase.execute(
      ad,
      dto.target ?? 'telegram',
      new Date(),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a scheduling post + its media files' })
  @ApiResponse({ status: 200, description: 'Scheduling post deleted' })
  public async remove(@Param('id') id: string): Promise<void> {
    SchedulingAdsController.ensureAdId(id);
    const existing = await this.adRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Scheduled post ${id} not found`);
    }
    const mediaIds = [
      existing.imageMediaId,
      existing.videoMediaId,
      ...(existing.albumMediaIds ?? []),
    ].filter((mediaId): mediaId is string => mediaId !== null);
    for (const mediaId of new Set(mediaIds)) {
      const media = await this.adMediaRepo.findById(mediaId);
      if (media) {
        await this.storage.remove(media.filePath);
        await this.adMediaRepo.delete(media.id);
      }
    }
    await this.adRepo.delete(id);
  }
}
