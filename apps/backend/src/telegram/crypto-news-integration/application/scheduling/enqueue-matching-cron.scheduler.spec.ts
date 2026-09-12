import { SchedulerRegistry } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { EnqueueMatchingCronScheduler } from './enqueue-matching-cron.scheduler';
import { FilteredCryptoNewsService } from 'telegram/crypto-news-integration/application/services/filtered-crypto-news.service';
import { EnqueueMatchingMessageUseCase } from 'telegram/crypto-news-publisher/application/handlers/enqueue-matching-message.use-case';
import { MatchingConfigRepository } from 'telegram/crypto-news-integration/application/ports/matching-config.repository';
import { MatchingHealthState } from 'telegram/crypto-news-integration/application/state/matching-health.state';

/**
 * Regression tests for F3 blocking finding #2 (media `url` vs `filePath`).
 *
 * The ingestion-service HTTP API strips `filePath` from media items and
 * exposes only a serving `url` (`/ingestion-api/media/...`). The scheduler
 * must map that into a `filePath` the publisher chain can consume
 * (`collectImagePaths` → `imagePaths` → `ensureLocalFiles`, which downloads
 * HTTP URLs and falls back to ingestion-service for local-style paths).
 * Before the fix, `CryptoNewsMedia.create({filePath: undefined})` threw and
 * every message WITH media was skipped (per-message catch → `skipped++`).
 */
describe('EnqueueMatchingCronScheduler (media mapping regression)', () => {
  const serverMediaItem = {
    id: 'media-1',
    index: 0,
    type: 'photo' as const,
    // NOTE: server shape — `url` present, `filePath` ABSENT.
    url: '/ingestion-api/media/-1009998887001/7001/0',
    mimeType: 'image/jpeg',
    fileSize: 12345,
  };

  const matchedDto = {
    id: 'msg-uuid-1',
    channelId: '-1009998887001',
    messageId: 7001,
    title: null,
    content: 'F3PROBE chrono: F3REWRITTEN-APEX breaks out on testnet',
    publishedAt: new Date().toISOString(),
    ingestedAt: new Date().toISOString(),
    linkPreviewUrl: null,
    linkPreviewTitle: null,
    linkPreviewDescription: null,
    linkPreviewSiteName: null,
    messageEntities: null,
    groupedId: null,
    media: [serverMediaItem],
    matchedKeywords: [],
    hasMedia: true,
  };

  function buildScheduler(
    matches: unknown[],
    onEnqueue?: (input: {
      message: { media: ReadonlyArray<{ filePath: string }> };
    }) => void,
  ) {
    const filteredNewsService = {
      getMatchingMessages: jest.fn().mockResolvedValue(matches),
    } as unknown as FilteredCryptoNewsService;
    const enqueueUseCase = {
      execute: jest.fn().mockImplementation((input: unknown) => {
        onEnqueue?.(
          input as {
            message: { media: ReadonlyArray<{ filePath: string }> };
          },
        );
        return Promise.resolve({ id: 'entry-1' });
      }),
    } as unknown as EnqueueMatchingMessageUseCase;
    const matchingConfigRepo = {
      load: jest.fn().mockResolvedValue({ enabled: true }),
    } as unknown as MatchingConfigRepository;
    const health = new MatchingHealthState();
    const scheduler = new EnqueueMatchingCronScheduler(
      filteredNewsService,
      enqueueUseCase,
      matchingConfigRepo,
      health,
      {} as SchedulerRegistry,
      {} as ConfigService,
    );
    return { scheduler, enqueueUseCase, health };
  }

  it('enqueues a media-bearing DTO (does not skip on missing filePath)', async () => {
    const { scheduler, enqueueUseCase } = buildScheduler([matchedDto]);

    await scheduler.tick();

    expect(enqueueUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it('maps server media `url` into a non-empty, publisher-consumable filePath', async () => {
    let capturedFilePath: string | undefined;
    const { scheduler } = buildScheduler([matchedDto], (input) => {
      capturedFilePath = input.message.media[0]?.filePath;
    });

    await scheduler.tick();

    expect(capturedFilePath).toBeDefined();
    expect(typeof capturedFilePath).toBe('string');
    expect((capturedFilePath as string).trim().length).toBeGreaterThan(0);
  });

  it('still enqueues text-only DTOs (no media)', async () => {
    const textOnly = { ...matchedDto, media: [], hasMedia: false };
    const { scheduler, enqueueUseCase } = buildScheduler([textOnly]);

    await scheduler.tick();

    expect(enqueueUseCase.execute).toHaveBeenCalledTimes(1);
  });

  it('reads the SOLE source crypto_news_matching_config id=1: skips silently when disabled', async () => {
    const filteredNewsService = {
      getMatchingMessages: jest.fn(),
    } as unknown as FilteredCryptoNewsService;
    const enqueueUseCase = {
      execute: jest.fn(),
    } as unknown as EnqueueMatchingMessageUseCase;
    const matchingConfigRepo = {
      load: jest.fn().mockResolvedValue({ enabled: false }),
    } as unknown as MatchingConfigRepository;
    const health = new MatchingHealthState();
    const scheduler = new EnqueueMatchingCronScheduler(
      filteredNewsService,
      enqueueUseCase,
      matchingConfigRepo,
      health,
      {} as SchedulerRegistry,
      {} as ConfigService,
    );

    await scheduler.tick();

    expect(matchingConfigRepo.load).toHaveBeenCalled();
    expect(
      filteredNewsService.getMatchingMessages as jest.Mock,
    ).not.toHaveBeenCalled();
    expect(enqueueUseCase.execute).not.toHaveBeenCalled();
    // A disabled skip performs no fetch, so health stays untouched.
    expect(health.lastTickAt).toBeNull();
    expect(health.lastFetchOk).toBeNull();
  });

  it('skips tick when MatchingConfig load throws (fail-closed)', async () => {
    const filteredNewsService = {
      getMatchingMessages: jest.fn(),
    } as unknown as FilteredCryptoNewsService;
    const enqueueUseCase = {
      execute: jest.fn(),
    } as unknown as EnqueueMatchingMessageUseCase;
    const matchingConfigRepo = {
      load: jest.fn().mockRejectedValue(new Error('db down')),
    } as unknown as MatchingConfigRepository;
    const scheduler = new EnqueueMatchingCronScheduler(
      filteredNewsService,
      enqueueUseCase,
      matchingConfigRepo,
      new MatchingHealthState(),
      {} as SchedulerRegistry,
      {} as ConfigService,
    );

    await scheduler.tick();

    expect(
      filteredNewsService.getMatchingMessages as jest.Mock,
    ).not.toHaveBeenCalled();
    expect(enqueueUseCase.execute).not.toHaveBeenCalled();
  });

  describe('matching-health mutations', () => {
    it('records success + enqueue timestamp when matches are enqueued', async () => {
      const { scheduler, health } = buildScheduler([matchedDto]);

      await scheduler.tick();

      expect(health.lastFetchOk).toBe(true);
      expect(health.consecutiveFetchFailures).toBe(0);
      expect(health.lastTickAt).not.toBeNull();
      expect(health.lastEnqueuedAt).toBe(health.lastTickAt);
    });

    it('records success without enqueue timestamp when nothing matches', async () => {
      const { scheduler, health } = buildScheduler([]);

      await scheduler.tick();

      expect(health.lastFetchOk).toBe(true);
      expect(health.consecutiveFetchFailures).toBe(0);
      expect(health.lastTickAt).not.toBeNull();
      expect(health.lastEnqueuedAt).toBeNull();
    });

    it('records failure and increments the counter when the fetch throws', async () => {
      const filteredNewsService = {
        getMatchingMessages: jest
          .fn()
          .mockRejectedValue(new Error('ingestion down')),
      } as unknown as FilteredCryptoNewsService;
      const enqueueUseCase = {
        execute: jest.fn(),
      } as unknown as EnqueueMatchingMessageUseCase;
      const matchingConfigRepo = {
        load: jest.fn().mockResolvedValue({ enabled: true }),
      } as unknown as MatchingConfigRepository;
      const health = new MatchingHealthState();
      const scheduler = new EnqueueMatchingCronScheduler(
        filteredNewsService,
        enqueueUseCase,
        matchingConfigRepo,
        health,
        {} as SchedulerRegistry,
        {} as ConfigService,
      );

      await scheduler.tick();
      await scheduler.tick();

      expect(health.lastFetchOk).toBe(false);
      expect(health.consecutiveFetchFailures).toBe(2);
      expect(health.lastTickAt).not.toBeNull();
      expect(health.lastEnqueuedAt).toBeNull();
      expect(enqueueUseCase.execute).not.toHaveBeenCalled();
    });

    it('a success resets the failure counter', async () => {
      const filteredNewsService = {
        getMatchingMessages: jest
          .fn()
          .mockRejectedValueOnce(new Error('ingestion down'))
          .mockResolvedValueOnce([]),
      } as unknown as FilteredCryptoNewsService;
      const enqueueUseCase = {
        execute: jest.fn(),
      } as unknown as EnqueueMatchingMessageUseCase;
      const matchingConfigRepo = {
        load: jest.fn().mockResolvedValue({ enabled: true }),
      } as unknown as MatchingConfigRepository;
      const health = new MatchingHealthState();
      const scheduler = new EnqueueMatchingCronScheduler(
        filteredNewsService,
        enqueueUseCase,
        matchingConfigRepo,
        health,
        {} as SchedulerRegistry,
        {} as ConfigService,
      );

      await scheduler.tick();
      expect(health.consecutiveFetchFailures).toBe(1);

      await scheduler.tick();
      expect(health.lastFetchOk).toBe(true);
      expect(health.consecutiveFetchFailures).toBe(0);
    });
  });
});
