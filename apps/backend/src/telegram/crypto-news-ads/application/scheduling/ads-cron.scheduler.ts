import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { PublishAdUseCase } from 'telegram/crypto-news-ads/application/handlers/publish-ad.use-case';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import { AdRotationConfigRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-config.repository';

/**
 * Postgres advisory-lock ID for the ads rotation. DISTINCT from the
 * news publisher's `7_421_371` (`publisher-cron.scheduler.ts:17`) so the
 * two crons never contend with each other — each ticks independently
 * every minute. All replicas must use the SAME id within one scope.
 */
const ADS_ADVISORY_LOCK_ID = 8_013_203;

/**
 * Cron scheduler for the ads rotation.
 *
 * Runs every minute. On each tick (mirrors `PublisherCronScheduler`):
 *  1. Skip if the previous tick is still running (busy guard).
 *  2. Load the rotation config (the `.enabled` check is applied AFTER
 *     the sweep — see 5).
 *  3. `pg_try_advisory_lock(<id>)` — non-blocking; if another process /
 *     tick holds it, log + return.
 *  4. SWEEP expired ads (housekeeping: disable or delete per
 *     `expirationAction`) — runs even when rotation is OFF so an ad
 *     that expires while disabled is still cleaned up, and a publish
 *     failure never prevents it.
 *  5. Check `.enabled` — now gates ONLY the publish step, not the
 *     sweep above it.
 *  6. `PublishAdUseCase.execute()` — one ad decision per tick.
 *  7. `pg_advisory_unlock(<id>)` in `finally` so a thrown error in the
 *     sweep or the use case still releases the lock and resets `running`.
 *
 * The enabled check lives BOTH here and inside `PublishAdUseCase`
 * step 1 — this one gates the publish step of the tick; the use case's
 * is a defensive second layer for the REST-toggled path.
 */
@Injectable()
export class AdsCronScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdsCronScheduler.name);
  private running = false;

  public constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly publishAdUseCase: PublishAdUseCase,
    private readonly rotationConfigRepo: AdRotationConfigRepository,
    private readonly adRepo: AdRepository,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      const cfg = await this.rotationConfigRepo.load();
      this.logger.log(`AdsCronScheduler ready (enabled=${cfg.enabled})`);
    } catch {
      this.logger.warn(
        'AdsCronScheduler ready — could not load AdRotationConfig; scheduler will retry on each tick',
      );
    }
  }

  @Cron(CronExpression.EVERY_MINUTE)
  public async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('previous ads tick still running; skipping this tick');
      return;
    }
    let enabled = false;
    try {
      const cfg = await this.rotationConfigRepo.load();
      enabled = cfg.enabled;
    } catch (err) {
      this.logger.error(
        `failed to load AdRotationConfig on tick: ${(err as Error).message} — skipping`,
      );
      return;
    }
    this.running = true;
    const now = new Date();
    let lockHeld = false;
    try {
      lockHeld = await this.tryAcquireLock();
      if (!lockHeld) {
        this.logger.log(
          'ads advisory lock held by another process — skipping tick',
        );
        return;
      }
      await this.sweepExpiredAds(now);
      if (!enabled) {
        return;
      }
      await this.publishAdUseCase.execute(now);
    } catch (err) {
      this.logger.error(
        `ads tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    } finally {
      if (lockHeld) {
        try {
          await this.releaseLock();
        } catch (unlockErr) {
          this.logger.error(
            `failed to release ads advisory lock: ${(unlockErr as Error).message}`,
          );
        }
      }
      this.running = false;
    }
  }

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

  private async releaseLock(): Promise<void> {
    await this.dataSource.query('SELECT pg_advisory_unlock($1)', [
      ADS_ADVISORY_LOCK_ID,
    ]);
  }

  /**
   * Housekeeping pass that runs on every tick — BEFORE the rotation
   * `.enabled` check — so an ad expiring while rotation is OFF is still
   * swept, and a publish failure never prevents it. Disable is the
   * default; `expirationAction === 'delete'` removes the ad entirely.
   * Idempotent: a second run finds no rows (`findExpired` only returns
   * `expires_at IS NOT NULL AND expires_at <= now`), and disable/delete
   * on an already-disabled/deleted row is a repo no-op.
   */
  private async sweepExpiredAds(now: Date): Promise<void> {
    const expired = await this.adRepo.findExpired(now);
    if (expired.length === 0) {
      return;
    }
    let disabled = 0;
    let deleted = 0;
    for (const ad of expired) {
      if (ad.expirationAction === 'delete') {
        await this.adRepo.delete(ad.id);
        deleted += 1;
      } else {
        await this.adRepo.disable(ad.id);
        disabled += 1;
      }
    }
    this.logger.log(
      `ads sweep: ${expired.length} expired (${disabled} disabled, ${deleted} deleted)`,
    );
  }
}
