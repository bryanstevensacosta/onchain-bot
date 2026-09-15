import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ProcessNextThreadsArticleUseCase } from 'threads/publisher/application/handlers/process-next-threads-article.use-case';
import { ThreadsLlmConfigRepository } from 'threads/publisher/application/ports/threads-llm-config.repository';

/**
 * Postgres advisory-lock ID ensuring only one Threads publisher
 * process drains the queue at a time. Deliberately distinct from the
 * crypto-news publisher lock (7_421_371), the ads lock (8_013_203) and
 * the retention janitor lock (9_421_373) so the three loops never
 * block each other.
 */
export const THREADS_PUBLISHER_ADVISORY_LOCK_ID = 7_421_372;

/**
 * Cron publisher for the Threads queue.
 *
 * Clone of `PublisherCronScheduler` (crypto-news), Threads-typed:
 * runs every 10 minutes (Threads rate limits are stricter than the
 * Telegram Bot API path, so the drain tick is slower than the 1-minute
 * crypto-news tick). On each tick:
 *  1. Load `ThreadsLlmConfig`; return early when `publishingEnabled`
 *     is false (gate — no lock, no drain).
 *  2. `pg_try_advisory_lock(<id>)` — non-blocking. If `false`, another
 *     process / tick is already draining → skip WITHOUT error.
 *  3. `ProcessNextThreadsArticleUseCase.execute()` — drains ONE
 *     pending entry (the use case enforces daily cap + throttle +
 *     retry budget).
 *  4. `pg_advisory_unlock(<id>)` — released in `finally`.
 */
@Injectable()
export class ThreadsPublisherCronScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ThreadsPublisherCronScheduler.name);
  private running = false;

  public constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly processNextUseCase: ProcessNextThreadsArticleUseCase,
    private readonly llmConfigRepo: ThreadsLlmConfigRepository,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    try {
      const cfg = await this.llmConfigRepo.load();
      this.logger.log(
        `ThreadsPublisherCronScheduler ready (publishingEnabled=${cfg.publishingEnabled})`,
      );
    } catch {
      this.logger.warn(
        'ThreadsPublisherCronScheduler ready — could not load ThreadsLlmConfig; scheduler will retry on each tick',
      );
    }
  }

  /**
   * Cron tick. Runs every 10 minutes.
   */
  @Cron('*/10 * * * *')
  public async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('previous tick still running; skipping this tick');
      return;
    }
    let publishingEnabled = false;
    try {
      const cfg = await this.llmConfigRepo.load();
      publishingEnabled = cfg.publishingEnabled;
    } catch (err) {
      this.logger.error(
        `failed to load ThreadsLlmConfig on tick: ${(err as Error).message} — skipping`,
      );
      return;
    }
    if (!publishingEnabled) {
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
        `threads publisher tick failed: ${(err as Error).message}`,
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

  private async tryAcquireLock(): Promise<boolean> {
    try {
      const result: ReadonlyArray<{ acquired: boolean }> =
        await this.dataSource.query(
          'SELECT pg_try_advisory_lock($1) AS acquired',
          [THREADS_PUBLISHER_ADVISORY_LOCK_ID],
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
      THREADS_PUBLISHER_ADVISORY_LOCK_ID,
    ]);
  }
}
