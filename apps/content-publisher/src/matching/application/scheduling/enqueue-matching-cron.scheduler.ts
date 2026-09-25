import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { FilteredCryptoNewsService } from '../services/filtered-crypto-news.service';
import { MatchedMessageEnqueuePort } from '../../domain/ports/matched-message-enqueue.port';
import { MatchingConfigRepository } from '../../domain/ports/matching-config.repository';
import { MatchingHealthState } from '../state/matching-health.state';

/**
 * Poll the typed feed for matching messages and hand them toward the queue.
 *
 * Fallback path that catches feed gaps (the realtime SSE path in the
 * ingestion module is primary). Guards, in order: MATCHING_CRON_ENABLED
 * env master switch, then the DB MatchingConfig flag (C-FLAGS-01), then
 * an overlap guard against concurrent ticks. Interval is dynamic:
 * every 1 minute standalone, every CRYPTO_NEWS_POLLING_INTERVAL_MINUTES
 * (default 5) when USE_SSE_CRYPTO_NEWS is on.
 */
@Injectable()
export class EnqueueMatchingCronScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(EnqueueMatchingCronScheduler.name);
  private readonly FETCH_LIMIT = 50;
  private readonly ADAPTIVE_REPOLL_THRESHOLD = 3;
  private readonly ADAPTIVE_REPOLL_DELAY_MS = 10_000;
  private isPolling = false;
  private consecutiveFullBatches = 0;

  public constructor(
    private readonly filteredNewsService: FilteredCryptoNewsService,
    private readonly enqueuePort: MatchedMessageEnqueuePort,
    private readonly matchingConfigRepo: MatchingConfigRepository,
    private readonly health: MatchingHealthState,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly configService: ConfigService,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    const useSse =
      this.configService.get<string>('USE_SSE_CRYPTO_NEWS') !== 'false';
    const pollingInterval = Number(
      this.configService.get<string>(
        'CRYPTO_NEWS_POLLING_INTERVAL_MINUTES',
        '5',
      ),
    );
    const safeInterval =
      Number.isFinite(pollingInterval) && pollingInterval >= 1
        ? Math.floor(pollingInterval)
        : 5;
    const intervalMinutes = useSse ? safeInterval : 1;
    const cronExpression = `*/${intervalMinutes} * * * *`;
    const job = new CronJob(cronExpression, () => void this.tick());
    this.schedulerRegistry.addCronJob('crypto-news-matching-poll', job);
    job.start();
    try {
      const cfg = await this.matchingConfigRepo.load();
      this.logger.log(
        `EnqueueMatchingCronScheduler ready (fetch limit: ${this.FETCH_LIMIT}, enabled: ${cfg.enabled}, interval: ${intervalMinutes}min, SSE: ${useSse ? 'enabled' : 'disabled'})`,
      );
    } catch {
      this.logger.warn(
        `EnqueueMatchingCronScheduler ready (fetch limit: ${this.FETCH_LIMIT}, enabled: unknown, interval: ${intervalMinutes}min, SSE: ${useSse ? 'enabled' : 'disabled'}) — could not load MatchingConfig; scheduler will retry on each tick`,
      );
    }
  }

  public async tick(): Promise<void> {
    if (
      this.configService.get<string>('MATCHING_CRON_ENABLED', 'true') ===
      'false'
    ) {
      return;
    }
    if (this.isPolling) {
      this.logger.warn('Previous tick still running; skipping this tick');
      return;
    }
    this.isPolling = true;
    try {
      let enabled = false;
      try {
        enabled = (await this.matchingConfigRepo.load()).enabled;
      } catch (err) {
        this.logger.error(
          `Failed to load MatchingConfig on tick: ${(err as Error).message} — skipping`,
        );
        return;
      }
      if (!enabled) {
        return;
      }
      const matches = await this.filteredNewsService.getMatchingMessages(
        this.FETCH_LIMIT,
      );
      this.health.recordFetchSuccess();
      if (matches.length >= this.FETCH_LIMIT) {
        this.consecutiveFullBatches += 1;
      } else {
        this.consecutiveFullBatches = 0;
      }
      if (matches.length === 0) {
        this.logger.debug(
          `No matching messages found (fetched up to ${this.FETCH_LIMIT})`,
        );
        return;
      }
      this.logger.log(
        `Found ${matches.length} matching messages, enqueuing...`,
      );
      let enqueued = 0;
      let skipped = 0;
      for (const match of matches) {
        try {
          const result = await this.enqueuePort.enqueue(match);
          if (result.enqueued) {
            enqueued++;
          } else {
            skipped++;
          }
        } catch (error) {
          this.logger.error(
            `Failed to enqueue message ${match.channelId}:${match.messageId}: ${(error as Error).message}`,
          );
          skipped++;
        }
      }
      this.logger.log(
        `Enqueue batch complete: ${enqueued} enqueued, ${skipped} skipped (out of ${matches.length} matches)`,
      );
      if (enqueued > 0) {
        this.health.recordEnqueued();
      }
      if (this.consecutiveFullBatches >= this.ADAPTIVE_REPOLL_THRESHOLD) {
        this.consecutiveFullBatches = 0;
        this.logger.log(
          `Sustained full batches detected; scheduling catch-up re-poll in ${this.ADAPTIVE_REPOLL_DELAY_MS}ms`,
        );
        const timer = setTimeout(
          () => void this.tick(),
          this.ADAPTIVE_REPOLL_DELAY_MS,
        );
        const withUnref = timer as unknown as { unref?: () => void };
        if (typeof withUnref.unref === 'function') {
          withUnref.unref();
        }
      }
    } catch (error) {
      this.consecutiveFullBatches = 0;
      this.health.recordFetchFailure();
      this.logger.error(
        `Enqueue tick failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    } finally {
      this.isPolling = false;
    }
  }
}
