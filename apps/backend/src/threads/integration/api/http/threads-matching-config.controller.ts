import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ThreadsMatchingConfigRepository } from 'threads/integration/application/ports/threads-matching-config.repository';
import { ThreadsMatchingHealthState } from 'threads/integration/application/state/threads-matching-health.state';
import { ThreadsQueueRepository } from 'threads/publisher/application/ports/threads-queue.repository';
import { UpdateThreadsMatchingConfigDto } from 'threads/integration/api/input/threads-matching-config.input';
import {
  toThreadsMatchingConfigView,
  type ThreadsMatchingConfigView,
} from 'threads/integration/application/mappers/threads-matching-config.mapper';

export type { ThreadsMatchingConfigView } from 'threads/integration/application/mappers/threads-matching-config.mapper';

/**
 * Live view of the threads matching pipeline. Field names are frozen —
 * they mirror the crypto `MatchingHealthView` 6-field contract verbatim
 * (frontend health badge depends on this exact shape).
 */
export interface ThreadsMatchingHealthView {
  readonly enabled: boolean;
  readonly lastTickAt: string | null;
  readonly lastFetchOk: boolean | null;
  readonly consecutiveFetchFailures: number;
  readonly lastEnqueuedAt: string | null;
  readonly queuePending: number;
}

/**
 * REST API for the threads keyword-matching activation flag.
 *
 * Mirror of crypto `MatchingConfigController`:
 * Endpoints (under `/threads/matching`):
 *  - GET    /config   Current ThreadsMatchingConfig (single row, id = 1)
 *  - PATCH  /config   Partial update ({ enabled })
 *  - GET    /health   Live pipeline health (6-field view)
 *
 * SOLE source of truth: `threads_matching_configs` id = 1.
 * Both read paths — EnqueueThreadsCronScheduler.tick() and
 * ProcessThreadsMessageHandler.handle() — load this exact row via
 * ThreadsMatchingConfigRepository.load().
 *
 * Fresh DBs seed `enabled = true` (fail-open per T5 contract; the crypto
 * mirror seeds `false` fail-closed).
 */
@Controller('threads/matching')
export class ThreadsMatchingConfigController {
  public constructor(
    private readonly matchingConfigRepo: ThreadsMatchingConfigRepository,
    private readonly health: ThreadsMatchingHealthState,
    private readonly queueRepo: ThreadsQueueRepository,
  ) {}

  @Get('config')
  public async getConfig(): Promise<ThreadsMatchingConfigView> {
    const cfg = await this.matchingConfigRepo.load();
    return toThreadsMatchingConfigView(cfg);
  }

  @Get('health')
  public async getHealth(): Promise<ThreadsMatchingHealthView> {
    const [cfg, queuePending] = await Promise.all([
      this.matchingConfigRepo.load(),
      this.queueRepo.countPending(),
    ]);
    return {
      enabled: cfg.enabled,
      lastTickAt: this.health.lastTickAt,
      lastFetchOk: this.health.lastFetchOk,
      consecutiveFetchFailures: this.health.consecutiveFetchFailures,
      lastEnqueuedAt: this.health.lastEnqueuedAt,
      queuePending,
    };
  }

  @Patch('config')
  public async updateConfig(
    @Body() dto: UpdateThreadsMatchingConfigDto,
  ): Promise<ThreadsMatchingConfigView> {
    const cfg = await this.matchingConfigRepo.load();
    cfg.update({ enabled: dto.enabled });
    await this.matchingConfigRepo.save(cfg);
    return toThreadsMatchingConfigView(cfg);
  }
}
