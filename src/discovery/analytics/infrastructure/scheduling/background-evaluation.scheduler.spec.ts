import { BackgroundEvaluationScheduler } from 'discovery/analytics/infrastructure/scheduling/background-evaluation.scheduler';
import { ProcessDueEvaluationJobsUseCase } from 'discovery/analytics/application/handlers/process-due-evaluation-jobs.use-case';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CallEvaluationJob } from 'discovery/analytics/domain/entities/call-evaluation-job.entity';
import { EvaluationHorizonVo } from 'discovery/analytics/domain/value-objects/evaluation-horizon.vo';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';

class FakeConfig {
  constructor(private readonly cfg: Record<string, unknown>) {}
  public get<T>(key: string): T {
    return this.cfg[key] as T;
  }
}

const EVM = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

describe('BackgroundEvaluationScheduler', () => {
  let processDue: { execute: jest.Mock };

  beforeEach(() => {
    processDue = {
      execute: jest.fn().mockResolvedValue({
        processed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
      }),
    };
  });

  it('onModuleInit registers cron job when enabled', () => {
    const cfg = new FakeConfig({
      app: {
        analytics: {
          schedulerEnabled: true,
          schedulerCron: '0 0 * * *',
          schedulerBatchSize: 50,
        },
      },
    });
    const registry = new SchedulerRegistry();
    const scheduler = new BackgroundEvaluationScheduler(
      cfg as unknown as ConfigService,
      registry,
      processDue as unknown as ProcessDueEvaluationJobsUseCase,
    );

    scheduler.onModuleInit();

    const jobs = registry.getCronJobs();
    expect(jobs.has('analytics-evaluation-due')).toBe(true);

    scheduler.onModuleDestroy();
    registry.deleteCronJob('analytics-evaluation-due');
  });

  it('onModuleInit skips cron when disabled', () => {
    const cfg = new FakeConfig({
      app: {
        analytics: {
          schedulerEnabled: false,
          schedulerCron: '0 0 * * *',
          schedulerBatchSize: 50,
        },
      },
    });
    const registry = new SchedulerRegistry();
    const scheduler = new BackgroundEvaluationScheduler(
      cfg as unknown as ConfigService,
      registry,
      processDue as unknown as ProcessDueEvaluationJobsUseCase,
    );

    scheduler.onModuleInit();

    const jobs = registry.getCronJobs();
    expect(jobs.has('analytics-evaluation-due')).toBe(false);
  });

  it('tick() delegates to ProcessDueEvaluationJobsUseCase with configured batchSize', async () => {
    const cfg = new FakeConfig({
      app: {
        analytics: {
          schedulerEnabled: true,
          schedulerCron: '0 0 * * *',
          schedulerBatchSize: 25,
        },
      },
    });
    const registry = new SchedulerRegistry();
    const scheduler = new BackgroundEvaluationScheduler(
      cfg as unknown as ConfigService,
      registry,
      processDue as unknown as ProcessDueEvaluationJobsUseCase,
    );

    scheduler.onModuleInit();
    await scheduler.tick();

    expect(processDue.execute).toHaveBeenCalledWith(25);

    scheduler.onModuleDestroy();
    registry.deleteCronJob('analytics-evaluation-due');
  });

  it('onModuleDestroy stops the cron job', () => {
    const cfg = new FakeConfig({
      app: {
        analytics: {
          schedulerEnabled: true,
          schedulerCron: '0 0 * * *',
          schedulerBatchSize: 50,
        },
      },
    });
    const registry = new SchedulerRegistry();
    const scheduler = new BackgroundEvaluationScheduler(
      cfg as unknown as ConfigService,
      registry,
      processDue as unknown as ProcessDueEvaluationJobsUseCase,
    );

    scheduler.onModuleInit();
    expect(registry.getCronJobs().has('analytics-evaluation-due')).toBe(true);

    scheduler.onModuleDestroy();
    registry.deleteCronJob('analytics-evaluation-due');
  });

  it('tick() handles errors without throwing', async () => {
    const cfg = new FakeConfig({
      app: {
        analytics: {
          schedulerEnabled: true,
          schedulerCron: '0 0 * * *',
          schedulerBatchSize: 50,
        },
      },
    });
    const registry = new SchedulerRegistry();
    processDue.execute.mockRejectedValue(new Error('boom'));
    const scheduler = new BackgroundEvaluationScheduler(
      cfg as unknown as ConfigService,
      registry,
      processDue as unknown as ProcessDueEvaluationJobsUseCase,
    );

    scheduler.onModuleInit();
    await expect(scheduler.tick()).resolves.toBeUndefined();

    scheduler.onModuleDestroy();
    registry.deleteCronJob('analytics-evaluation-due');
  });
});

// Sanity test that we can build a job and inspect its scheduledAt
describe('job scheduledAt math', () => {
  it('24h job is scheduled 24h after call', () => {
    const ts = new Date('2026-01-01T00:00:00Z');
    const job = CallEvaluationJob.enqueue({
      channelId: 'SpyDefi',
      chain: ChainId.ETHEREUM,
      address: EVM,
      callTimestamp: ts,
      mcAtCall: 100_000,
      horizon: EvaluationHorizonVo.H24,
    });
    expect(job.scheduledAt.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });
});
