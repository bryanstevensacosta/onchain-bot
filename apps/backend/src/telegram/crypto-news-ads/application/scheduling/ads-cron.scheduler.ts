import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { PublishAdUseCase } from 'telegram/crypto-news-ads/application/handlers/publish-ad.use-case';
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
 *  2. Load the rotation config and check `.enabled` — if the rotation
 *     is disabled, return with ZERO tick work (ads default OFF).
 *  3. `pg_try_advisory_lock(<id>)` — non-blocking; if another process /
 *     tick holds it, log + return.
 *  4. `PublishAdUseCase.execute()` — one ad decision per tick.
 *  5. `pg_advisory_unlock(<id>)` in `finally` so a thrown error in the
 *     use case still releases the lock and resets `running`.
 *
 * The enabled check lives BOTH here and inside `PublishAdUseCase`
 * step 1 (T5) — this one short-circuits the whole tick; the use case's
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
    if (!enabled) {
      return;
    }
    this.running = true;
    let lockHeld = false;
    try {
      lockHeld = await this.tryAcquireLock();
      if (!lockHeld) {
        this.logger.log(
          'ads advisory lock held by another process — skipping tick',
        );
        return;
      }
      await this.publishAdUseCase.execute();
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
}
