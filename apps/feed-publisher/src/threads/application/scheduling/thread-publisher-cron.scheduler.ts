import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { ThreadRepository } from '../../domain/ports/thread.repository';
import { PublishThreadUseCase } from '../use-cases/publish-thread.use-case';
import { ThreadsHealthState } from '../state/threads-health.state';

const DUE_BATCH_LIMIT = 10;

/**
 * Threads publisher scheduler: one tick per minute (todo 8 skeleton).
 *
 * Mirrors the scheduling cron minus the Postgres advisory lock (single
 * instance until GAP-3; the overlap guard covers double ticks
 * in-process). Guards, in order: THREADS_CRON_ENABLED env master
 * switch, then the overlap guard.
 *
 * Each tick publishes due QUEUED/PARTIAL/backoff-elapsed threads via
 * PublishThreadUseCase (resume-from-index, never reposts). Terminal
 * and backoff-held threads are skipped by the repository filter.
 */
@Injectable()
export class ThreadPublisherCronScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ThreadPublisherCronScheduler.name);
  private isTicking = false;

  public constructor(
    private readonly publishThread: PublishThreadUseCase,
    private readonly threads: ThreadRepository,
    private readonly health: ThreadsHealthState,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    const job = new CronJob('* * * * *', () => void this.tick());
    this.schedulerRegistry.addCronJob('feed-threads-publisher', job);
    job.start();
    this.logger.log(
      'ThreadPublisherCronScheduler ready (every 1 minute, skeleton — HTTP stays 501 until v2)',
    );
  }

  public async tick(now: Date = new Date()): Promise<void> {
    if (this.config.get<string>('THREADS_CRON_ENABLED', 'true') === 'false') {
      return;
    }
    if (this.isTicking) {
      this.logger.warn('Previous threads tick still running; skipping');
      return;
    }
    this.isTicking = true;
    try {
      const due = await this.threads.findDueToPublish(now, DUE_BATCH_LIMIT);
      for (const thread of due) {
        try {
          const result = await this.publishThread.execute(thread.id, now);
          if (result.skipped === null) {
            this.health.recordProcessed(now);
          }
        } catch (error) {
          this.health.recordFailure((error as Error).message, now);
          this.logger.error(
            `Threads tick failed for ${thread.id}: ${(error as Error).message}`,
          );
        }
      }
      this.health.recordTick(now);
    } catch (error) {
      this.health.recordFailure((error as Error).message, now);
      this.logger.error(
        `Threads tick failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    } finally {
      this.isTicking = false;
    }
  }
}
