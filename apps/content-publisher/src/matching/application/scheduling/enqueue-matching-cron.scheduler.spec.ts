import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { EnqueueMatchingCronScheduler } from './enqueue-matching-cron.scheduler';
import { FilteredCryptoNewsService } from '../services/filtered-crypto-news.service';
import { MatchingConfigRepository } from '../../domain/ports/matching-config.repository';
import { MatchingHealthState } from '../state/matching-health.state';
import { MatchedMessageEnqueuePort } from '../../domain/ports/matched-message-enqueue.port';
import { MatchingConfig } from '../../domain/matching-config.entity';

describe('EnqueueMatchingCronScheduler', () => {
  function build(opts?: {
    enabled?: boolean;
    cronEnabled?: string;
    matches?: number;
  }) {
    const filtered = {
      getMatchingMessages: jest.fn().mockResolvedValue(
        Array.from({ length: opts?.matches ?? 1 }, (_, i) => ({
          channelId: '-1001',
          messageId: 100 + i,
          title: null,
          content: 'etf inflows',
          publishedAt: new Date().toISOString(),
          ingestedAt: new Date().toISOString(),
          media: [],
          groupedId: null,
          messageType: 'crypto-news',
          matchedKeywords: [],
          hasMedia: false,
        })),
      ),
    } as unknown as FilteredCryptoNewsService;
    const enqueue: MatchedMessageEnqueuePort = {
      enqueue: jest.fn().mockResolvedValue({ enqueued: true }),
    };
    const repo: MatchingConfigRepository = {
      load: jest.fn().mockResolvedValue(
        MatchingConfig.reconstitute({
          id: 1,
          enabled: opts?.enabled ?? true,
          updatedAt: new Date(),
        }),
      ),
      save: jest.fn(),
    };
    const health = new MatchingHealthState();
    const config = {
      get: jest.fn((key: string, fallback?: unknown) =>
        key === 'MATCHING_CRON_ENABLED'
          ? (opts?.cronEnabled ?? 'true')
          : fallback,
      ),
    } as unknown as ConfigService;
    const registry = new SchedulerRegistry();
    const scheduler = new EnqueueMatchingCronScheduler(
      filtered,
      enqueue,
      repo,
      health,
      registry,
      config,
    );
    return { scheduler, filtered, enqueue, health, registry };
  }

  it('skips the tick when matching is disabled in DB config', async () => {
    const { scheduler, filtered, enqueue } = build({ enabled: false });
    await scheduler.tick();
    expect(filtered.getMatchingMessages).not.toHaveBeenCalled();
    expect(enqueue.enqueue).not.toHaveBeenCalled();
  });

  it('skips the tick when the cron master switch is off', async () => {
    const { scheduler, filtered } = build({ cronEnabled: 'false' });
    await scheduler.tick();
    expect(filtered.getMatchingMessages).not.toHaveBeenCalled();
  });

  it('enqueues every match and records health on success', async () => {
    const { scheduler, enqueue, health } = build({ matches: 2 });
    await scheduler.tick();
    expect(enqueue.enqueue).toHaveBeenCalledTimes(2);
    expect(health.lastFetchOk).toBe(true);
    expect(health.lastEnqueuedAt).not.toBeNull();
  });

  it('skips overlapping ticks with a warn guard', async () => {
    const { scheduler, filtered } = build();
    (filtered.getMatchingMessages as jest.Mock).mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 50)),
    );
    const first = scheduler.tick();
    await scheduler.tick();
    await first;
    expect(filtered.getMatchingMessages).toHaveBeenCalledTimes(1);
  });

  it('registers a dynamic cron job on bootstrap (module wiring)', async () => {
    const module = await Test.createTestingModule({
      providers: [
        EnqueueMatchingCronScheduler,
        {
          provide: FilteredCryptoNewsService,
          useValue: { getMatchingMessages: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: MatchedMessageEnqueuePort,
          useValue: { enqueue: jest.fn() },
        },
        {
          provide: MatchingConfigRepository,
          useValue: {
            load: jest.fn().mockResolvedValue(
              MatchingConfig.reconstitute({
                id: 1,
                enabled: false,
                updatedAt: new Date(),
              }),
            ),
            save: jest.fn(),
          },
        },
        MatchingHealthState,
        SchedulerRegistry,
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_: string, fb?: unknown) => fb) },
        },
      ],
    }).compile();
    const scheduler = module.get(EnqueueMatchingCronScheduler);
    await scheduler.onApplicationBootstrap();
    const registry = module.get(SchedulerRegistry);
    expect(registry.doesExist('cron', 'crypto-news-matching-poll')).toBe(true);
    await module.close();
  });
});
