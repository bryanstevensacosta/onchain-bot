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
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import { AdMediaRepository } from 'telegram/crypto-news-ads/application/ports/ad-media.repository';
import { AdMediaStoragePort } from 'telegram/crypto-news-ads/application/ports/ad-media-storage.port';
import { UploadAdImageUseCase } from 'telegram/crypto-news-ads/application/handlers/upload-ad-image.use-case';
import { ClearAdImageUseCase } from 'telegram/crypto-news-ads/application/handlers/clear-ad-image.use-case';
import { ReuseLibraryImageUseCase } from 'telegram/crypto-news-ads/application/handlers/reuse-library-image.use-case';
import { UploadAdVideoUseCase } from 'telegram/crypto-news-ads/application/handlers/upload-ad-video.use-case';
import { ClearAdVideoUseCase } from 'telegram/crypto-news-ads/application/handlers/clear-ad-video.use-case';
import { ReuseLibraryImagesUseCase } from 'telegram/crypto-news-ads/application/handlers/reuse-library-images.use-case';
import {
  PublishAdNowUseCase,
  type PublishAdNowResult,
} from 'telegram/crypto-news-ads/application/handlers/publish-ad-now.use-case';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { UUID_RE } from './ad-uuid';
import {
  CreateAdDto,
  ReuseAdImageDto,
  ReuseLibraryImagesDto,
  UpdateAdDto,
} from 'telegram/crypto-news-ads/api/input/ads.input';
import {
  applyAdPatch,
  isUniqueViolation,
  toAdView,
  type AdView,
} from 'telegram/crypto-news-ads/application/mappers/ads.mapper';

/**
 * REST API for the crypto-news ad catalog (under `/crypto-news-ads/ads`):
 * CRUD (GET/POST/PATCH/DELETE) + image/video upload+clear
 * (`:id/image`, `:id/video`) + album from the media library
 * (`:id/reuse-library-images`) + immediate send (`:id/publish-now`).
 *
 * Media serving lives in `AdsMediaController` (GET `/crypto-news-ads/media…`).
 * Bodies validated by the global `ValidationPipe` (400 on shape
 * violations). `Ad` is immutable — PATCH rebuilds via `applyAdPatch`.
 */
@Controller([
  'crypto-news-ads/ads',
  'crypto-news-scheduling/ads',
  'feed-scheduling/ads',
])
export class AdsController {
  public constructor(
    private readonly adRepo: AdRepository,
    private readonly adMediaRepo: AdMediaRepository,
    private readonly storage: AdMediaStoragePort,
    private readonly uploadImageUseCase: UploadAdImageUseCase,
    private readonly clearImageUseCase: ClearAdImageUseCase,
    private readonly reuseImageUseCase: ReuseLibraryImageUseCase,
    private readonly uploadVideoUseCase: UploadAdVideoUseCase,
    private readonly clearVideoUseCase: ClearAdVideoUseCase,
    private readonly reuseLibraryImagesUseCase: ReuseLibraryImagesUseCase,
    private readonly publishAdNowUseCase: PublishAdNowUseCase,
  ) {}

  @Get()
  public async list(): Promise<ReadonlyArray<AdView>> {
    const ads = await this.adRepo.findAll();
    return ads.map(toAdView);
  }

  private static ensureAdId(id: string): void {
    if (!UUID_RE.test(id)) {
      throw new NotFoundException(`Ad ${id} not found`);
    }
  }

  @Post()
  public async create(@Body() dto: CreateAdDto): Promise<AdView> {
    const existing = await this.adRepo.findAll();
    const nextOrder =
      existing.reduce((max, a) => Math.max(max, a.order), -1) + 1;
    const ad = Ad.create({
      name: dto.name,
      body: dto.body,
      order: nextOrder,
      buttons: dto.buttons ?? null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      expirationAction: dto.expirationAction ?? 'disable',
    });
    try {
      const saved = await this.adRepo.save(ad);
      return toAdView(saved);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Ad name already exists: ${dto.name}`);
      }
      throw err;
    }
  }

  @Patch(':id')
  public async update(
    @Param('id') id: string,
    @Body() dto: UpdateAdDto,
  ): Promise<AdView> {
    AdsController.ensureAdId(id);
    const existing = await this.adRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Ad ${id} not found`);
    }
    const expiresAt =
      dto.expiresAt === undefined
        ? undefined
        : dto.expiresAt === null
          ? null
          : new Date(dto.expiresAt);
    let updated: Ad;
    try {
      updated = applyAdPatch(existing, { ...dto, expiresAt }, new Date());
    } catch (err) {
      if (err instanceof DomainError && err.code === ErrorCode.CONFLICT) {
        throw new ConflictException(err.message);
      }
      throw err;
    }
    try {
      const saved = await this.adRepo.save(updated);
      return toAdView(saved);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          `Ad name already exists: ${dto.name ?? existing.name}`,
        );
      }
      throw err;
    }
  }

  @Post(':id/image')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  public async uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<AdView> {
    AdsController.ensureAdId(id);
    return this.uploadImageUseCase.execute({
      adId: id,
      buffer: file.buffer,
      originalFileName: file.originalname,
    });
  }

  @Post(':id/reuse-image')
  public async reuseImage(
    @Param('id') id: string,
    @Body() dto: ReuseAdImageDto,
  ): Promise<AdView> {
    AdsController.ensureAdId(id);
    return this.reuseImageUseCase.execute({
      adId: id,
      libraryMediaId: dto.libraryMediaId,
    });
  }

  @Delete(':id/image')
  public async clearImage(@Param('id') id: string): Promise<AdView> {
    AdsController.ensureAdId(id);
    return this.clearImageUseCase.execute(id);
  }

  @Post(':id/video')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }),
  )
  public async uploadVideo(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<AdView> {
    AdsController.ensureAdId(id);
    return this.uploadVideoUseCase.execute({
      adId: id,
      buffer: file.buffer,
      originalFileName: file.originalname,
    });
  }

  @Delete(':id/video')
  public async clearVideo(@Param('id') id: string): Promise<AdView> {
    AdsController.ensureAdId(id);
    return this.clearVideoUseCase.execute(id);
  }

  @Post(':id/reuse-library-images')
  public async reuseLibraryImages(
    @Param('id') id: string,
    @Body() dto: ReuseLibraryImagesDto,
  ): Promise<AdView> {
    AdsController.ensureAdId(id);
    return this.reuseLibraryImagesUseCase.execute({
      adId: id,
      libraryMediaIds: dto.libraryMediaIds,
    });
  }

  @Post(':id/publish-now')
  public async publishNow(
    @Param('id') id: string,
  ): Promise<PublishAdNowResult> {
    AdsController.ensureAdId(id);
    const ad = await this.adRepo.findById(id);
    if (!ad) {
      throw new NotFoundException(`Ad ${id} not found`);
    }
    return this.publishAdNowUseCase.execute(ad, new Date());
  }

  @Delete(':id')
  public async remove(@Param('id') id: string): Promise<void> {
    AdsController.ensureAdId(id);
    const existing = await this.adRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Ad ${id} not found`);
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
