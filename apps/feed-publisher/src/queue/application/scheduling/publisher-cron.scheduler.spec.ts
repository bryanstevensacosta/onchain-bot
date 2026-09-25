import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { PublisherCronScheduler } from './publisher-cron.scheduler';
import { ProcessNextQueuedArticleUseCase } from '../use-cases/process-next-queued-article.use-case';
import { QueueHealthState } from '../state/queue-health.state';

function build(
  opts: { publishingEnabled?: string; cronEnabled?: string } = {},
) {
  const processNext = {
    execute: jest.fn().mockResolvedValue({ processed: true }),
  } as unknown as ProcessNextQueuedArticleUseCase;
  const health = new QueueHealthState();
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'PUBLISHING_ENABLED') {
        return opts.publishingEnabled ?? 'true';
      }
      if (key === 'PUBLISHER_CRON_ENABLED') {
        return opts.cronEnabled ?? 'true';
      }
      return fallback;
    }),
  } as unknown as ConfigService;
  const registry = new SchedulerRegistry();
  const scheduler = new PublisherCronScheduler(
    processNext,
    health,
    registry,
    config,
  );
  return { scheduler, processNext, health, registry };
}

describe('PublisherCronScheduler', () => {
  it('drains one article per tick and records health', async () => {
    const { scheduler, processNext, health } = build();
    await scheduler.tick();
    expect(processNext.execute).toHaveBeenCalledTimes(1);
    expect(health.lastTickAt).not.toBeNull();
  });

  it('skips the tick when publishing is disabled', async () => {
    const { scheduler, processNext } = build({ publishingEnabled: 'false' });
    await scheduler.tick();
    expect(processNext.execute).not.toHaveBeenCalled();
  });

  it('skips the tick when the cron master switch is off', async () => {
    const { scheduler, processNext } = build({ cronEnabled: 'false' });
    await scheduler.tick();
    expect(processNext.execute).not.toHaveBeenCalled();
  });

  it('skips overlapping ticks with a warn, then recovers', async () => {
    const { scheduler, processNext } = build();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    (processNext.execute as jest.Mock).mockImplementationOnce(() => gate);
    const first = scheduler.tick();
    await scheduler.tick();
    expect(processNext.execute).toHaveBeenCalledTimes(1);
    release();
    await first;
    await scheduler.tick();
    expect(processNext.execute).toHaveBeenCalledTimes(2);
  });
});
