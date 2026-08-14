import * as path from 'node:path';
import { promises as fs } from 'node:fs';
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
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import { AdMediaRepository } from 'telegram/crypto-news-ads/application/ports/ad-media.repository';
import { AdMediaLibraryRepository } from 'telegram/crypto-news-ads/application/ports/ad-media-library.repository';
import { AdMediaStoragePort } from 'telegram/crypto-news-ads/application/ports/ad-media-storage.port';
import { UploadAdImageUseCase } from 'telegram/crypto-news-ads/application/handlers/upload-ad-image.use-case';
import { ClearAdImageUseCase } from 'telegram/crypto-news-ads/application/handlers/clear-ad-image.use-case';
import { ReuseLibraryImageUseCase } from 'telegram/crypto-news-ads/application/handlers/reuse-library-image.use-case';
import { UploadAdVideoUseCase } from 'telegram/crypto-news-ads/application/handlers/upload-ad-video.use-case';
import { ClearAdVideoUseCase } from 'telegram/crypto-news-ads/application/handlers/clear-ad-video.use-case';
import { ReuseLibraryImagesUseCase } from 'telegram/crypto-news-ads/application/handlers/reuse-library-images.use-case';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import {
  detectMediaMimeType,
  serveMediaFile,
} from 'shared/common/http/media-serving';
import type { AppConfig } from 'shared/common/config/app.config';
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

/** UUID id param (ad or media) — reject anything else before it reaches
 *  the lookup so non-UUID ids return a clean 404 instead of a Postgres
 *  `invalid input syntax for type uuid` 500. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * REST API for the crypto-news ad catalog.
 *
 * Endpoints (under `/crypto-news-ads/ads`):
 *  - GET    /            All ads
 *  - POST   /            Create an ad (409 on duplicate name)
 *  - PATCH  /:id         Partial update (404 unknown id)
 *  - DELETE /:id         Remove (404 unknown id; NO 409 — ads are not
 *                        referenced elsewhere)
 *  - POST   /:id/image   Multipart upload of the ad image (delegates to
 *                        `UploadAdImageUseCase`; NO body DTO — the global
 *                        `forbidNonWhitelisted` pipe would 400 multipart)
 *  - DELETE /:id/image   Clear the ad image (delegates to
 *                        `ClearAdImageUseCase`)
 *  - POST   /:id/video   Multipart upload of the ad video (delegates to
 *                        `UploadAdVideoUseCase`; only MP4/H.264, ≤50 MB)
 *  - DELETE /:id/video   Clear the ad video (delegates to
 *                        `ClearAdVideoUseCase`)
 *  - POST   /:id/reuse-library-images  Set the ad album from 1..10
 *                        media-library entries (delegates to
 *                        `ReuseLibraryImagesUseCase`)
 *
 * Request bodies validated by the global `ValidationPipe` (400 on
 * shape violations). `Ad` is immutable — PATCH rebuilds via
 * `applyAdPatch` and saves the new instance.
 */
@Controller('crypto-news-ads/ads')
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

/**
 * Serves an ad image attachment by its media-row UUID.
 *
 * Clone of the crypto-news serve pattern (Range/206 support, 404 on
 * missing row or file — never 500 for a stale path). Only the STORED
 * relative path from the media row is joined with the uploads root.
 */
@Controller('crypto-news-ads')
export class AdsMediaController {
  private readonly uploadsRoot: string;

  public constructor(
    private readonly adMediaRepo: AdMediaRepository,
    private readonly libraryRepo: AdMediaLibraryRepository,
    config: ConfigService,
  ) {
    const appCfg = config.getOrThrow<AppConfig>('app');
    this.uploadsRoot = appCfg.uploadsRoot;
  }

  @Get('media/:mediaId')
  public async getMedia(
    @Param('mediaId') mediaId: string,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!UUID_RE.test(mediaId)) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }
    const media = await this.adMediaRepo.findById(mediaId);
    if (!media) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }
    const resolvedRoot = path.resolve(this.uploadsRoot);
    const absPath = path.resolve(this.uploadsRoot, media.filePath);
    if (!absPath.startsWith(resolvedRoot + path.sep)) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(absPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        res.status(404).json({ error: 'Media file missing on disk' });
        return;
      }
      throw err;
    }

    const mimeType = detectMediaMimeType(
      media.filePath,
      media.mimeType,
      fileBuffer,
    );
    serveMediaFile(
      res,
      req,
      fileBuffer,
      mimeType,
      'public, max-age=86400, immutable',
    );
  }

  @Get('media-library')
  public async listMediaLibrary(): Promise<
    ReadonlyArray<{
      id: string;
      url: string;
      originalFileName: string | null;
      mimeType: string | null;
      fileSize: number | null;
      createdAt: Date;
    }>
  > {
    const library = await this.libraryRepo.findAll();
    return library.map((m) => ({
      id: m.id,
      url: `/crypto-news-ads/media-library/${m.id}`,
      originalFileName: m.originalFileName,
      mimeType: m.mimeType,
      fileSize: m.fileSize,
      createdAt: m.createdAt,
    }));
  }

  @Get('media-library/:libraryMediaId')
  public async getLibraryMedia(
    @Param('libraryMediaId') libraryMediaId: string,
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    if (!UUID_RE.test(libraryMediaId)) {
      res.status(404).json({ statusCode: 404, message: 'Media not found' });
      return;
    }
    const record = await this.libraryRepo.findById(libraryMediaId);
    if (!record) {
      res.status(404).json({ statusCode: 404, message: 'Media not found' });
      return;
    }
    const resolvedRoot = path.resolve(this.uploadsRoot);
    const absPath = path.resolve(this.uploadsRoot, record.filePath);
    if (!absPath.startsWith(resolvedRoot + path.sep)) {
      res.status(404).json({ statusCode: 404, message: 'Media not found' });
      return;
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(absPath);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        res.status(404).json({
          statusCode: 404,
          message: 'Media file missing on disk',
        });
        return;
      }
      throw err;
    }

    const mimeType = detectMediaMimeType(
      record.filePath,
      record.mimeType,
      fileBuffer,
    );
    serveMediaFile(
      res,
      req,
      fileBuffer,
      mimeType,
      'public, max-age=86400, immutable',
    );
  }
}
