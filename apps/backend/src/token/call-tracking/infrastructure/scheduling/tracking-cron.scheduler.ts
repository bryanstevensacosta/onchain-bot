import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { UpdateTrackedCallsUseCase } from '../../application/handlers/update-tracked-calls.use-case';

const CRON_NAME = 'tracking-cron-scheduler';
const DEFAULT_CRON = '*/5 * * * *';
const DEFAULT_BATCH_SIZE = 30;

@Injectable()
export class TrackingCronScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(TrackingCronScheduler.name);
  private running = false;

  constructor(
    private readonly updateUseCase: UpdateTrackedCallsUseCase,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    const cronExpr = process.env.TRACKING_CRON ?? DEFAULT_CRON;
    if (process.env.TRACKING_CRON_ENABLED === 'false') {
      this.logger.log('TrackingCronScheduler disabled via env');
      return;
    }
    const job = new CronJob(cronExpr, () => {
      void this.tick();
    });
    this.schedulerRegistry.addCronJob(CRON_NAME, job);
    job.start();
    this.logger.log(`TrackingCronScheduler started (cron=${cronExpr})`);
  }

  async tick(batchSize?: number): Promise<void> {
    if (this.running) {
      this.logger.warn('Previous tick still running; skipping this tick');
      return;
    }
    this.running = true;
    try {
      const result = await this.updateUseCase.execute({
        batchSize: batchSize ?? DEFAULT_BATCH_SIZE,
      });
      this.logger.log(
        `Tracking tick complete: evaluated=${result.evaluated} updated=${result.updated} skipped=${result.skipped}`,
      );
    } catch (err) {
      this.logger.error(
        `Tracking tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    } finally {
      this.running = false;
    }
  }
}
