import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { CronJob } from 'cron';
import { ProcessNextQueuedArticleUseCase } from '../use-cases/process-next-queued-article.use-case';
import { QueueHealthState } from '../state/queue-health.state';

/**
 * Publisher drain scheduler: one article per minute (todo 4).
 *
 * Mirrors the backend `publisher-cron` (EVERY_MINUTE) minus the Postgres
 * advisory lock (single instance until GAP-3 Redis/BullMQ; the overlap
 * guard covers double ticks in-process). Guards, in order:
 * PUBLISHER_CRON_ENABLED env master switch, PUBLISHING_ENABLED flag
 * (C-FLAGS-01, full pipeline needs llm AND publishing — todo 5 owns the
 * llm half), then the overlap guard.
 */
@Injectable()
export class PublisherCronScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(PublisherCronScheduler.name);
  private isDraining = false;

  public constructor(
    private readonly processNext: ProcessNextQueuedArticleUseCase,
    private readonly health: QueueHealthState,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  public async onApplicationBootstrap(): Promise<void> {
    const job = new CronJob('* * * * *', () => void this.tick());
    this.schedulerRegistry.addCronJob('feed-publisher-drain', job);
    job.start();
    this.logger.log('PublisherCronScheduler ready (every 1 minute)');
  }

  public async tick(): Promise<void> {
    if (this.config.get<string>('PUBLISHER_CRON_ENABLED', 'true') === 'false') {
      return;
    }
    if (this.isDraining) {
      this.logger.warn('Previous drain still running; skipping this tick');
      return;
    }
    this.isDraining = true;
    try {
      if (this.config.get<string>('PUBLISHING_ENABLED', 'true') === 'false') {
        return;
      }
      this.health.recordTick();
      await this.processNext.execute();
    } catch (error) {
      this.health.recordFailure((error as Error).message);
      this.logger.error(
        `Publisher drain tick failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
    } finally {
      this.isDraining = false;
    }
  }
}
