import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ThreadsQueueRepository } from 'threads/publisher/application/ports/threads-queue.repository';

/**
 * TTL scheduler for the Threads publisher queue.
 *
 * Clone of `ExpireStaleQueueEntriesScheduler` (crypto-news),
 * Threads-typed. Runs every 30 minutes. On each tick:
 *  1. Finds all PENDING entries older than 24 hours
 *     (`queuedAt < NOW() - 24h`).
 *  2. Marks them FAILED with reason
 *     `"Expired: exceeded 24h in queue without publishing"`.
 *
 * Same rationale as the mirror: the queue must not grow unboundedly
 * while `publishingEnabled=false`, and 24h-old crypto news is stale.
 *
 * No advisory lock needed: this scheduler only marks entries FAILED;
 * concurrent replicas are safe (first `markFailed` wins, the rest
 * throw per `VALID_PUBLISH_TRANSITIONS` and are logged + skipped).
 */
@Injectable()
export class ExpireStaleThreadsScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ExpireStaleThreadsScheduler.name);

  /** 24 hours in milliseconds */
  private static readonly TTL_THRESHOLD_MS = 24 * 60 * 60 * 1000;

  private running = false;

  public constructor(private readonly queueRepo: ThreadsQueueRepository) {}

  public async onApplicationBootstrap(): Promise<void> {
    this.logger.log(
      `ExpireStaleThreadsScheduler ready (TTL: 24h, tick: every 30 min)`,
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
        ExpireStaleThreadsScheduler.TTL_THRESHOLD_MS,
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
