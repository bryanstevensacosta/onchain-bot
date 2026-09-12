import { Body, Controller, Get, Patch } from '@nestjs/common';
import { MatchingConfigRepository } from 'telegram/crypto-news-integration/application/ports/matching-config.repository';
import { MatchingHealthState } from 'telegram/crypto-news-integration/application/state/matching-health.state';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import { UpdateMatchingConfigDto } from 'telegram/crypto-news-integration/api/input/matching-config.input';
import {
  toMatchingConfigView,
  type MatchingConfigView,
} from 'telegram/crypto-news-integration/application/mappers/matching-config.mapper';

export type { MatchingConfigView } from 'telegram/crypto-news-integration/application/mappers/matching-config.mapper';

/**
 * Live view of the matching pipeline. Field names are frozen — the
 * frontend MatchingToggleButton / health badge depends on this exact
 * shape.
 */
export interface MatchingHealthView {
  readonly enabled: boolean;
  readonly lastTickAt: string | null;
  readonly lastFetchOk: boolean | null;
  readonly consecutiveFetchFailures: number;
  readonly lastEnqueuedAt: string | null;
  readonly queuePending: number;
}

/**
 * REST API for the crypto-news keyword-matching activation flag.
 *
 * Endpoints (under `/crypto-news/matching`):
 *  - GET    /config   Current MatchingConfig (single row, id = 1)
 *  - PATCH  /config   Partial update ({ enabled })
 *  - GET    /health   Live pipeline health (6-field view)
 *
 * SOLE source of truth: `crypto_news_matching_config` id = 1.
 * Both read paths — EnqueueMatchingCronScheduler.tick() and
 * ProcessCryptoNewsMessageHandler.handle() — load this exact row via
 * MatchingConfigRepository.load(). The frontend MatchingToggleButton is
 * the ONLY writer (Start/Stop).
 *
 * `LlmConfig.matchingEnabled` (`crypto_news_publisher_llm_config`) is
 * DEPRECATED and rejected on write (see LlmConfigController.updateConfig
 * 400 guard). Fresh DBs seed `enabled = false` (fail-closed) until the
 * operator toggles ON.
 *
 * No MATCHING_* env var exists or may be added — matching is owned by
 * the DB. Transport env (INGESTION_SERVICE_URL, USE_SSE_CRYPTO_NEWS,
 * CRYPTO_NEWS_POLLING_INTERVAL_MINUTES) is unrelated and unchanged.
 */
@Controller('crypto-news/matching')
export class MatchingConfigController {
  public constructor(
    private readonly matchingConfigRepo: MatchingConfigRepository,
    private readonly health: MatchingHealthState,
    private readonly queueRepo: PublisherQueueRepository,
  ) {}

  @Get('config')
  public async getConfig(): Promise<MatchingConfigView> {
    const cfg = await this.matchingConfigRepo.load();
    return toMatchingConfigView(cfg);
  }

  @Get('health')
  public async getHealth(): Promise<MatchingHealthView> {
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
    @Body() dto: UpdateMatchingConfigDto,
  ): Promise<MatchingConfigView> {
    const cfg = await this.matchingConfigRepo.load();
    cfg.update({ enabled: dto.enabled });
    await this.matchingConfigRepo.save(cfg);
    return toMatchingConfigView(cfg);
  }
}
