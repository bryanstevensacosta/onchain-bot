import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ProcessNextQueuedArticleUseCase } from 'telegram/crypto-news-publisher/application/handlers/process-next-queued-article.use-case';
import { LlmConfigRepository } from 'telegram/crypto-news-publisher/application/ports/llm-config.repository';

/**
 * Postgres advisory-lock ID used to ensure only one publisher
 * process drains the queue at a time. The value is arbitrary; what
 * matters is that all replicas of the backend use the SAME id so
 * `pg_try_advisory_lock` rejects the second one.
 *
 * If the lock is held by another tick (or replica), the cron simply
 * skips the tick — it never blocks. The next minute, it tries again.
 */
const PUBLISHER_ADVISORY_LOCK_ID = 7_421_371;

/**
 * Cron publisher for the crypto-news queue.
 *
 * Runs every minute. On each tick:
 *  1. `pg_try_advisory_lock(<id>)` — non-blocking. If `false`, another
 *     process / tick is already draining the queue → return.
 *  2. `ProcessNextQueuedArticleUseCase.execute()` — drains ONE
 *     pending entry (the use case itself enforces daily cap + random
 *     delay + retry budget).
 *  3. `pg_advisory_unlock(<id>)` — release the lock in `finally` so a
 *     thrown error in the use case still releases the lock.
 *
 * The scheduler is disabled when the BC is disabled in config
 * (`crypto-news-publisher.config.json#enabled === false`). The lock
 * itself is still acquired and released so the cron loop stays
 * observable in logs and so the lock semantics are consistent across
 * dev/prod.
 *
 * Path is `application/scheduling/` (per the wave-4 spec) even though
 * the rest of the repo keeps cron files under `infrastructure/scheduling/`.
 * The spec is explicit; we honour it.
 */
@Injectable()
export class PublisherCronScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(PublisherCronScheduler.name);
  private running = false;

  public constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly processNextUseCase: ProcessNextQueuedArticleUseCase,
    private readonly llmConfigRepo: LlmConfigRepository,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      const cfg = await this.llmConfigRepo.load();
      this.logger.log(`PublisherCronScheduler ready (enabled=${cfg.enabled})`);
    } catch {
      this.logger.warn(
        'PublisherCronScheduler ready — could not load LlmConfig; scheduler will retry on each tick',
      );
    }
  }

  /**
   * Cron tick. Runs at the start of every minute. The decorator-based
   * approach keeps the scheduling config co-located with the handler
   * (matches `ReconcileStuckReservationsScheduler`).
   */
  @Cron(CronExpression.EVERY_MINUTE)
  public async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('previous tick still running; skipping this tick');
      return;
    }
    let enabled = false;
    try {
      const cfg = await this.llmConfigRepo.load();
      enabled = cfg.enabled;
    } catch (err) {
      this.logger.error(
        `failed to load LlmConfig on tick: ${(err as Error).message} — skipping`,
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
          'advisory lock held by another process — skipping tick',
        );
        return;
      }
      await this.processNextUseCase.execute();
    } catch (err) {
      this.logger.error(
        `publisher tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    } finally {
      if (lockHeld) {
        try {
          await this.releaseLock();
        } catch (unlockErr) {
          this.logger.error(
            `failed to release advisory lock: ${(unlockErr as Error).message}`,
          );
        }
      }
      this.running = false;
    }
  }

  /**
   * `pg_try_advisory_lock` is non-blocking. Returns `true` if the lock
   * was acquired by this connection, `false` otherwise.
   *
   * Falls through with `false` (no lock acquired) when the database
   * is unreachable — the cron must not crash boot or the scheduler.
   */
  private async tryAcquireLock(): Promise<boolean> {
    try {
      const result: ReadonlyArray<{ acquired: boolean }> =
        await this.dataSource.query(
          'SELECT pg_try_advisory_lock($1) AS acquired',
          [PUBLISHER_ADVISORY_LOCK_ID],
        );
      const row = result[0];
      return row?.acquired === true;
    } catch (err) {
      this.logger.error(
        `advisory_lock query failed: ${(err as Error).message}`,
      );
      return false;
    }
  }

  private async releaseLock(): Promise<void> {
    await this.dataSource.query('SELECT pg_advisory_unlock($1)', [
      PUBLISHER_ADVISORY_LOCK_ID,
    ]);
  }
}
