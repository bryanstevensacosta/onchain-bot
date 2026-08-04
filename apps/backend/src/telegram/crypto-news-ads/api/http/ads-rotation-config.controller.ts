import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AdRotationConfigRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-config.repository';
import { UpdateRotationConfigDto } from 'telegram/crypto-news-ads/api/input/ads.input';
import {
  toRotationConfigView,
  type RotationConfigView,
} from 'telegram/crypto-news-ads/application/mappers/ads.mapper';

/**
 * REST API for the ad-rotation schedule (the config used by
 * `RotationDeciderService` to gate ad publishing against the news
 * cadence).
 *
 * Endpoints (under `/crypto-news-ads/rotation-config`):
 *  - GET  /  Current rotation config (always present — the domain
 *            factory enforces defaults)
 *  - PATCH / Partial update (PATCH semantics via optional fields)
 */
@Controller('crypto-news-ads/rotation-config')
export class AdsRotationConfigController {
  public constructor(
    private readonly rotationConfigRepo: AdRotationConfigRepository,
  ) {}

  @Get()
  public async get(): Promise<RotationConfigView> {
    const config = await this.rotationConfigRepo.load();
    return toRotationConfigView(config);
  }

  @Patch()
  public async update(
    @Body() dto: UpdateRotationConfigDto,
  ): Promise<RotationConfigView> {
    const current = await this.rotationConfigRepo.load();
    const next = current.update({
      enabled: dto.enabled ?? current.enabled,
      everyNPosts: dto.everyNPosts ?? current.everyNPosts,
      minMinutesBetweenAds:
        dto.minMinutesBetweenAds ?? current.minMinutesBetweenAds,
    });
    await this.rotationConfigRepo.save(next);
    return toRotationConfigView(next);
  }
}
