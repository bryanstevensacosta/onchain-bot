import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';

/**
 * TTL scheduler for the crypto-news publisher queue.
 *
 * Runs every 30 minutes. On each tick:
 *  1. Finds all PENDING entries older than 24 hours (queued_at < NOW() - 24h)
 *  2. Marks them as FAILED with reason: "Expired: exceeded 24h in queue without publishing"
 *
 * This prevents the queue from growing indefinitely when publishingEnabled=false
 * for extended periods. Stale crypto news loses relevance after 24h, so
 * expiring them is preferable to publishing outdated content.
 *
 * The 24h threshold is hardcoded (per the spec) but could be made configurable
 * via LlmConfig if needed in the future.
 *
 * No advisory lock needed: this scheduler only marks entries FAILED, it doesn't
 * race with the publisher (which only touches PENDING→PUBLISHING→PUBLISHED).
 * Multiple replicas running this scheduler concurrently is safe — the first
 * one to save() wins, subsequent saves are no-ops (entry already FAILED).
 */
@Injectable()
export class ExpireStaleQueueEntriesScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExpireStaleQueueEntriesScheduler.name);

  /** 24 hours in milliseconds */
  private static readonly TTL_THRESHOLD_MS = 24 * 60 * 60 * 1000;

  private running = false;

  public constructor(private readonly queueRepo: PublisherQueueRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    this.logger.log(
      `ExpireStaleQueueEntriesScheduler ready (TTL: 24h, tick: every 30 min)`,
    );
  }

  /**
   * Cron tick. Runs every 30 minutes.
   */
  @Cron('*/30 * * * *')
  public async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('previous tick still running; skipping this tick');
      return;
    }

    this.running = true;
    try {
      const stale = await this.queueRepo.findPendingOlderThan(
        ExpireStaleQueueEntriesScheduler.TTL_THRESHOLD_MS,
      );

      if (stale.length === 0) {
        this.logger.debug('no stale entries found');
        return;
      }

      this.logger.log(
        `found ${stale.length} stale entries (older than 24h) — marking FAILED`,
      );

      let expired = 0;
      for (const entry of stale) {
        try {
          await this.queueRepo.markFailed(
            entry.id,
            'Expired: exceeded 24h in queue without publishing',
          );
          expired++;
        } catch (err) {
          // Entry may have been published/failed by another process between
          // findPendingOlderThan and markFailed — log but continue
          this.logger.warn(
            `failed to expire entry ${entry.id}: ${(err as Error).message}`,
          );
        }
      }

      this.logger.log(`expired ${expired}/${stale.length} stale entries`);
    } catch (err) {
      this.logger.error(
        `expire tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    } finally {
      this.running = false;
    }
  }
}
