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
} from '@nestjs/common';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
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

/**
 * REST API for the crypto-news ad catalog.
 *
 * Endpoints (under `/crypto-news-ads/ads`):
 *  - GET    /            All ads
 *  - POST   /            Create an ad (409 on duplicate name)
 *  - PATCH  /:id         Partial update (404 unknown id)
 *  - DELETE /:id         Remove (404 unknown id; NO 409 — ads are not
 *                        referenced elsewhere)
 *
 * Request bodies validated by the global `ValidationPipe` (400 on
 * shape violations). `Ad` is immutable — PATCH rebuilds via
 * `applyAdPatch` and saves the new instance.
 */
@Controller('crypto-news-ads/ads')
export class AdsController {
  public constructor(private readonly adRepo: AdRepository) {}

  @Get()
  public async list(): Promise<ReadonlyArray<AdView>> {
    const ads = await this.adRepo.findAll();
    return ads.map(toAdView);
  }

  @Post()
  public async create(@Body() dto: CreateAdDto): Promise<AdView> {
    const ad = Ad.create({
      name: dto.name,
      body: dto.body,
      imagePath: dto.imagePath ?? null,
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
    const updated = applyAdPatch(existing, dto);
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

  @Delete(':id')
  public async remove(@Param('id') id: string): Promise<void> {
    const existing = await this.adRepo.findById(id);
    if (!existing) {
      throw new NotFoundException(`Ad ${id} not found`);
    }
    await this.adRepo.delete(id);
  }
}
