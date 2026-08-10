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
import { AdMediaStoragePort } from 'telegram/crypto-news-ads/application/ports/ad-media-storage.port';
import { UploadAdImageUseCase } from 'telegram/crypto-news-ads/application/handlers/upload-ad-image.use-case';
import { ClearAdImageUseCase } from 'telegram/crypto-news-ads/application/handlers/clear-ad-image.use-case';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import {
  detectMediaMimeType,
  serveMediaFile,
} from 'shared/common/http/media-serving';
import type { AppConfig } from 'shared/common/config/app.config';
import {
  CreateAdDto,
  UpdateAdDto,
} from 'telegram/crypto-news-ads/api/input/ads.input';
import {
  applyAdPatch,
  isUniqueViolation,
  toAdView,
  type AdView,
} from 'telegram/crypto-news-ads/application/mappers/ads.mapper';

/** Media ids are UUIDs — reject anything else before it reaches the lookup. */
const MEDIA_ID_UUID =
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
  ) {}

  @Get()
  public async list(): Promise<ReadonlyArray<AdView>> {
    const ads = await this.adRepo.findAll();
    return ads.map(toAdView);
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
    return this.uploadImageUseCase.execute({ adId: id, buffer: file.buffer });
  }

  @Delete(':id/image')
  public async clearImage(@Param('id') id: string): Promise<AdView> {
    return this.clearImageUseCase.execute(id);
  }

  @Delete(':id')
  public async remove(@Param('id') id: string): Promise<void> {
    const existing = await this.adRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Ad ${id} not found`);
    }
    if (existing.imageMediaId !== null) {
      const media = await this.adMediaRepo.findById(existing.imageMediaId);
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
    if (!MEDIA_ID_UUID.test(mediaId)) {
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
}
