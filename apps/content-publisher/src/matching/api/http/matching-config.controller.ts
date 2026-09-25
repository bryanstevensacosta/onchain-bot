import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { MatchingConfigRepository } from '../../domain/ports/matching-config.repository';
import { MatchingHealthState } from '../../application/state/matching-health.state';
import {
  toMatchingConfigView,
  type MatchingConfigView,
} from '../../application/mappers/matching-config.mapper';
import { UpdateMatchingConfigDto } from '../input/matching-config.input';
import { InMemoryMatchedMessageCollector } from '../../infrastructure/feed/in-memory-matched-message.collector';

export interface MatchingHealthView {
  readonly enabled: boolean;
  readonly lastTickAt: string | null;
  readonly lastFetchOk: boolean | null;
  readonly consecutiveFetchFailures: number;
  readonly lastEnqueuedAt: string | null;
  readonly queuePending: number;
}

/**
 * Match-pipeline control (`/content-publisher/matching`).
 *
 * GET /config · PATCH /config (sole writer of the match flag) ·
 * GET /health (frozen 6-field view: flag, ticks, queue depth). Until todo 4
 * wires the unified queue, `queuePending` reads the in-memory collector
 * buffer depth.
 */
@ApiTags('content-publisher-matching')
@Controller('content-publisher/matching')
export class MatchingConfigController {
  public constructor(
    private readonly matchingConfigRepo: MatchingConfigRepository,
    private readonly health: MatchingHealthState,
    private readonly collector: InMemoryMatchedMessageCollector,
  ) {}

  @Get('config')
  @ApiOperation({ summary: 'Get the current keyword-matching activation flag' })
  @ApiResponse({ status: 200, description: 'Current MatchingConfig' })
  public async getConfig(): Promise<MatchingConfigView> {
    const cfg = await this.matchingConfigRepo.load();
    return toMatchingConfigView(cfg);
  }

  @Get('health')
  @ApiOperation({
    summary: 'Live matching pipeline health (flag, ticks, queue depth)',
  })
  @ApiResponse({ status: 200, description: 'Matching pipeline health' })
  public async getHealth(): Promise<MatchingHealthView> {
    const cfg = await this.matchingConfigRepo.load();
    return {
      enabled: cfg.enabled,
      lastTickAt: this.health.lastTickAt,
      lastFetchOk: this.health.lastFetchOk,
      consecutiveFetchFailures: this.health.consecutiveFetchFailures,
      lastEnqueuedAt: this.health.lastEnqueuedAt,
      queuePending: this.collector.collected().length,
    };
  }

  @Patch('config')
  @ApiOperation({
    summary: 'Toggle keyword-matching (sole writer of the match flag)',
  })
  @ApiResponse({ status: 200, description: 'MatchingConfig updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  public async updateConfig(
    @Body() dto: UpdateMatchingConfigDto,
  ): Promise<MatchingConfigView> {
    const cfg = await this.matchingConfigRepo.load();
    cfg.update({ enabled: dto.enabled });
    await this.matchingConfigRepo.save(cfg);
    return toMatchingConfigView(cfg);
  }
}
