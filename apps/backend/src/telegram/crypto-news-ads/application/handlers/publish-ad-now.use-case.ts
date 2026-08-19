import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import { AdRotationStateRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-state.repository';
import { ADS_ADVISORY_LOCK_ID } from 'telegram/crypto-news-ads/application/scheduling/ads-cron.scheduler';
import { AdFormatPublisherService } from 'telegram/crypto-news-ads/application/services/ad-format-publisher.service';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { SharedThrottleSchedulerService } from 'telegram/shared/application/services/shared-throttle-scheduler.service';
import { SlotArbitratorPort } from 'telegram/shared/domain/ports/slot-arbitrator.port';

/**
 * Outcome of a manual "publish now" request. The send outcome is data,
 * not transport status — the controller returns this object verbatim
 * (HTTP 200 even when `ok:false`); 404 stays for unknown ad ids.
 */
export interface PublishAdNowResult {
  ok: boolean;
  messageId: number | null;
  error: string | null;
}

/**
 * Manual publish flow for the "publish now" endpoint.
 *
 * Unlike `PublishAdUseCase` (the rotation tick), the controller has
 * ALREADY validated the ad exists and is sendable — so this use case
 * deliberately does NOT load the rotation config, active ads, throttle
 * gates, or the rotation decider. It only:
 *
 *   1. Acquires the SAME Postgres advisory lock the cron uses
 *      (`ADS_ADVISORY_LOCK_ID`, `ads-cron.scheduler.ts`), so a manual
 *      publish and a cron tick never send two ads in the same instant.
 *      The SQL/id are replicated verbatim from the cron's proven
 *      acquire/release pair — the pool may round-robin connections, so
 *      acquire on conn A / release on conn B would leak a session-level
 *      lock; using the exact same query shape keeps the behavior
 *      identical in prod.
 *   2. Sends the ad via `AdFormatPublisherService.publish` (never
 *      throws).
 *   3. On success, registers all four state transitions EXACTLY like
 *      `PublishAdUseCase` (`markAdPublished` → `setLastPublishAt` →
 *      `recordPublish('ads')` → `markPublished`).
 *   4. On failure, returns the error WITHOUT any failure bookkeeping —
 *      failure counting, auto-toggling-off and rotation-reset stay
 *      owned by the rotation flow (`PublishAdUseCase`) and are NOT
 *      called here.
 *
 * The lock is always released in `finally` so a thrown error (or a
 * slow send) never starves the cron.
 */
@Injectable()
export class PublishAdNowUseCase {
  private readonly logger = new Logger(PublishAdNowUseCase.name);

  public constructor(
    private readonly adRepo: AdRepository,
    private readonly rotationStateRepo: AdRotationStateRepository,
    private readonly sharedThrottle: SharedThrottleSchedulerService,
    private readonly slotArbitrator: SlotArbitratorPort,
    private readonly adFormatPublisher: AdFormatPublisherService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  public async execute(
    ad: Ad,
    now: Date = new Date(),
  ): Promise<PublishAdNowResult> {
    const acquired = await this.tryAcquireLock();
    if (!acquired) {
      this.logger.warn(
        'ads advisory lock held by another process — skipping manual publish',
      );
      return {
        ok: false,
        messageId: null,
        error: 'another publish in progress',
      };
    }

    try {
      const result = await this.adFormatPublisher.publish(ad);

      if (result.ok && result.messageId !== null) {
        await this.rotationStateRepo.markAdPublished(ad.id, now);
        await this.sharedThrottle.setLastPublishAt(now);
        await this.slotArbitrator.recordPublish('ads', now);
        await this.adRepo.markPublished(ad.id, String(result.messageId), now);
        this.logger.log(
          `published ad ${ad.id} as telegram message ${result.messageId}`,
        );
        return { ok: true, messageId: result.messageId, error: null };
      }

      return {
        ok: false,
        messageId: null,
        error: result.error ?? 'unknown error',
      };
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Non-blocking advisory-lock acquire. SQL/row shape copied verbatim
   * from `AdsCronScheduler.tryAcquireLock` — same statement, same id,
   * so the manual flow and the cron contend on the same lock.
   */
  private async tryAcquireLock(): Promise<boolean> {
    try {
      const result: ReadonlyArray<{ acquired: boolean }> =
        await this.dataSource.query(
          'SELECT pg_try_advisory_lock($1) AS acquired',
          [ADS_ADVISORY_LOCK_ID],
        );
      const row = result[0];
      return row?.acquired === true;
    } catch (err) {
      this.logger.error(
        `ads advisory_lock query failed: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Advisory-lock release. Mirrors `AdsCronScheduler.releaseLock` —
   * same statement, same id.
   */
  private async releaseLock(): Promise<void> {
    await this.dataSource.query('SELECT pg_advisory_unlock($1)', [
      ADS_ADVISORY_LOCK_ID,
    ]);
  }
}
