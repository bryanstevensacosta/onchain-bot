import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ProcessDueEvaluationJobsUseCase } from 'discovery/analytics/application/handlers/process-due-evaluation-jobs.use-case';

interface AnalyticsConfig {
  readonly analytics?: {
    readonly schedulerCron?: string;
    readonly schedulerEnabled?: boolean;
    readonly schedulerBatchSize?: number;
  };
}

/**
 * Background scheduler that runs every N minutes (configurable via
 * `ANALYTICS_SCHEDULER_CRON`, default: every 5 minutes) and processes
 * due `CallEvaluationJob`s.
 *
 * Registered with Nest's lifecycle:
 * - `onModuleInit`: starts the cron job
 * - `onModuleDestroy`: stops it (graceful shutdown)
 *
 * To disable entirely: `ANALYTICS_SCHEDULER_ENABLED=false`.
 *
 * For unit testing or local dev, you can also trigger manually via
 * `POST /ca/analytics/evaluate-due` (admin endpoint).
 */
@Injectable()
export class BackgroundEvaluationScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(BackgroundEvaluationScheduler.name);
  private readonly jobName = 'analytics-evaluation-due';
  private batchSize = 50;

  public constructor(
    private readonly configService: ConfigService,
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly processDue: ProcessDueEvaluationJobsUseCase,
  ) {}

  public onModuleInit(): void {
    const cfg = this.configService.get<AnalyticsConfig>('app')?.analytics;
    const enabled = cfg?.schedulerEnabled ?? true;
    const cronExpr = cfg?.schedulerCron ?? '*/5 * * * *';
    this.batchSize = cfg?.schedulerBatchSize ?? 50;

    if (!enabled) {
      this.logger.log(
        'Scheduler disabled via ANALYTICS_SCHEDULER_ENABLED=false',
      );
      return;
    }

    const job = new CronJob(cronExpr, () => {
      this.tick().catch((err) => {
        this.logger.error(
          `Tick failed: ${(err as Error).message}`,
          (err as Error).stack,
        );
      });
    });

    this.schedulerRegistry.addCronJob(this.jobName, job);
    job.start();

    this.logger.log(
      `Background evaluation scheduler started (cron="${cronExpr}", batchSize=${this.batchSize})`,
    );
  }

  public onModuleDestroy(): void {
    try {
      const job = this.schedulerRegistry.getCronJob(this.jobName);
      void job.stop();
      this.logger.log('Background evaluation scheduler stopped');
    } catch {
      // job wasn't registered (disabled) — ignore
    }
  }

  /**
   * Manually trigger a tick (used by admin endpoint and tests).
   * Errors are caught and logged so the caller doesn't have to handle them.
   */
  public async tick(): Promise<void> {
    this.logger.debug('Scheduler tick: processing due evaluation jobs');
    try {
      const result = await this.processDue.execute(this.batchSize);
      if (result.processed > 0) {
        this.logger.log(
          `Tick processed ${result.processed} job(s): ` +
            `${result.succeeded} succeeded, ${result.failed} failed, ${result.skipped} skipped`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Tick failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }
}
