import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { EvaluateActiveCallsUseCase } from '../../application/handlers/evaluate-active-calls.use-case';
import type { AppConfig } from 'shared/common/config/app.config';

const CRON_NAME = 'live-achievement-scheduler';
const DEFAULT_BATCH_SIZE = 30;

@Injectable()
export class LiveAchievementScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(LiveAchievementScheduler.name);
  private running = false;

  constructor(
    private readonly evaluate: EvaluateActiveCallsUseCase,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const cfg = this.config.get<AppConfig>('app')?.milestone;
    if (!cfg?.schedulerEnabled) {
      this.logger.log('LiveAchievementScheduler disabled via config');
      return;
    }

    const job = new CronJob(cfg.schedulerCron, () => {
      void this.tick();
    });

    this.schedulerRegistry.addCronJob(CRON_NAME, job);
    job.start();
    this.logger.log(
      `LiveAchievementScheduler started (cron=${cfg.schedulerCron})`,
    );
  }

  async tick(): Promise<void> {
    if (this.running) {
      this.logger.warn('Previous tick still running; skipping this tick');
      return;
    }
    this.running = true;
    try {
      const batchSize =
        this.config.get<AppConfig>('app')?.milestone.schedulerBatchSize ??
        DEFAULT_BATCH_SIZE;
      const result = await this.evaluate.execute({ batchSize });
      this.logger.log(
        `Tick complete: evaluated=${result.evaluated} notified=${result.notified} skipped=${result.skipped}`,
      );
    } catch (err) {
      this.logger.error(
        `Tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    } finally {
      this.running = false;
    }
  }
}
