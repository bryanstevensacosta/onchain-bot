import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SchedulingConfigRepository } from '../../domain/ports/scheduling-config.repository';
import { UpdateSchedulingRotationConfigDto } from '../input/scheduling.input';
import {
  toSchedulingRotationConfigView,
  type SchedulingRotationConfigView,
} from '../../application/mappers/scheduling.mapper';

/**
 * Scheduling rotation config (`/api/scheduling/rotation-config`,
 * P36 naming): the cadence knobs the `RotationDeciderService` gates
 * publishing against, with per-target P38 limits (publish delay +
 * daily cap each, enforced independently).
 *
 *  - GET  / Current config (always present — the domain factory
 *         enforces fail-closed defaults)
 *  - PATCH / Partial update (PATCH semantics via optional fields)
 */
@ApiTags('feed-publisher-scheduling')
@Controller('api/scheduling/rotation-config')
export class SchedulingRotationConfigController {
  public constructor(
    private readonly rotationConfigRepo: SchedulingConfigRepository,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Current scheduling rotation config' })
  @ApiResponse({ status: 200, description: 'Rotation config' })
  public async get(): Promise<SchedulingRotationConfigView> {
    const config = await this.rotationConfigRepo.load();
    return toSchedulingRotationConfigView(config);
  }

  @Patch()
  @ApiOperation({ summary: 'Patch the scheduling rotation config' })
  @ApiResponse({ status: 200, description: 'Rotation config updated' })
  public async update(
    @Body() dto: UpdateSchedulingRotationConfigDto,
  ): Promise<SchedulingRotationConfigView> {
    const current = await this.rotationConfigRepo.load();
    const next = current.update({
      enabled: dto.enabled ?? current.enabled,
      everyNPosts: dto.everyNPosts ?? current.everyNPosts,
      minMinutesBetweenAds:
        dto.minMinutesBetweenAds ?? current.minMinutesBetweenAds,
      telegram: dto.telegram,
      threads: dto.threads,
    });
    await this.rotationConfigRepo.save(next);
    return toSchedulingRotationConfigView(next);
  }
}
