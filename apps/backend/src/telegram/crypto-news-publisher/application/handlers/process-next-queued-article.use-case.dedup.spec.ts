import { Test, TestingModule } from '@nestjs/testing';
import { ProcessNextQueuedArticleUseCase } from './process-next-queued-article.use-case';
import { PublisherQueueRepository } from '../ports/publisher-queue.repository';
import { LlmConfigRepository } from '../ports/llm-config.repository';
import { SharedThrottleSchedulerService } from 'telegram/shared/application/services/shared-throttle-scheduler.service';
import { SharedThrottleStateRepository } from 'telegram/shared/application/ports/shared-throttle-state.repository';
import { CryptoNewsLlmAdapter } from 'telegram/crypto-news-publisher/infrastructure/llm/crypto-news-llm.adapter';
import { TelegramPublisherPort } from 'telegram/shared';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { LlmConfig } from 'telegram/crypto-news-publisher/domain/entities/llm-config.entity';
import { SlotArbitratorPort } from 'telegram/shared/domain/ports/slot-arbitrator.port';
import { AdRotationStateRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-state.repository';
import { MediaCleanupService } from 'telegram/crypto-news-publisher/infrastructure/services/media-cleanup.service';
import { CryptoNewsPublisherConfigService } from 'telegram/crypto-news-publisher/infrastructure/config/crypto-news-publisher.config';
import { DeduplicationService } from 'shared/deduplication/application/services/deduplication.service';
import { CRYPTO_NEWS_DEDUP_SOURCE } from './enqueue-matching-message.use-case';

describe('ProcessNextQueuedArticleUseCase dedup fingerprint store (task-10)', () => {
  let useCase: ProcessNextQueuedArticleUseCase;
  let queueRepo: {
    countPublishedToday: jest.Mock;
    findNextPending: jest.Mock;
    markPublished: jest.Mock;
  };
  let publisher: { sendMessage: jest.Mock };
  let dedup: { markAsSeen: jest.Mock };

  const entry = PublisherQueueEntry.create({
    channelId: 'chan-store',
    messageId: 555,
    rawContent: 'Store me for future dedup checks',
    rawTitle: null,
    imagePaths: [],
    groupedId: null,
    messageReceivedAt: new Date('2024-01-01T12:00:00Z'),
  });

  const buildModule = async (
    withDedup: boolean,
    markAsSeenImpl?: () => Promise<void>,
  ): Promise<TestingModule> => {
    queueRepo = {
      countPublishedToday: jest.fn().mockResolvedValue(0),
      findNextPending: jest.fn().mockResolvedValue(entry),
      markPublished: jest.fn().mockResolvedValue(entry),
    };
    publisher = {
      sendMessage: jest
        .fn()
        .mockResolvedValue({ ok: true, messageId: 999, error: null }),
    };
    dedup = {
      markAsSeen: jest.fn(markAsSeenImpl ?? (() => Promise.resolve())),
    };
    return Test.createTestingModule({
      providers: [
        ProcessNextQueuedArticleUseCase,
        { provide: PublisherQueueRepository, useValue: queueRepo },
        {
          provide: SharedThrottleSchedulerService,
          useValue: {
            shouldPublish: jest.fn().mockResolvedValue({ canPublish: true }),
            setLastPublishAt: jest.fn().mockResolvedValue(undefined),
          },
        },
        { provide: CryptoNewsLlmAdapter, useValue: {} },
        { provide: TelegramPublisherPort, useValue: publisher },
        { provide: SharedThrottleStateRepository, useValue: {} },
        {
          provide: LlmConfigRepository,
          useValue: {
            load: jest.fn().mockResolvedValue(
              LlmConfig.load({
                defaultTemplateId: 'tpl-default',
                targetChannel: '@crypto-news-test',
                llmEnabled: false,
                publishingEnabled: true,
                rejectNonLatin: false,
                dailyCap: 36,
                dailyResetUtcHour: 4,
                randomDelayMinMs: 180_000,
                randomDelayMaxMs: 900_000,
                llmMaxAttempts: 3,
              }),
            ),
          },
        },
        {
          provide: SlotArbitratorPort,
          useValue: {
            canPublishNow: jest.fn().mockResolvedValue({ canPublish: true }),
            recordPublish: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: AdRotationStateRepository,
          useValue: {
            incrementPostsSinceLastAd: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: MediaCleanupService,
          useValue: {
            cleanupPublishedMedia: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: CryptoNewsPublisherConfigService,
          useValue: { config: { publishing: { mediaTtlDays: 7 } } },
        },
        ...(withDedup
          ? [{ provide: DeduplicationService, useValue: dedup }]
          : []),
      ],
    }).compile();
  };

  it('publish success → fingerprint stored for future checks', async () => {
    const module = await buildModule(true);
    useCase = module.get<ProcessNextQueuedArticleUseCase>(
      ProcessNextQueuedArticleUseCase,
    );

    await useCase.execute();

    expect(queueRepo.markPublished).toHaveBeenCalledTimes(1);
    expect(dedup.markAsSeen).toHaveBeenCalledTimes(1);
    expect(dedup.markAsSeen).toHaveBeenCalledWith(
      CRYPTO_NEWS_DEDUP_SOURCE,
      'chan-store',
      555,
      'Store me for future dedup checks',
      undefined,
      entry.id,
    );
  });

  it('fingerprint store failure → publish still succeeds (fail-open)', async () => {
    const module = await buildModule(true, () =>
      Promise.reject(new Error('store down')),
    );
    useCase = module.get<ProcessNextQueuedArticleUseCase>(
      ProcessNextQueuedArticleUseCase,
    );

    await expect(useCase.execute()).resolves.toBeUndefined();
    expect(queueRepo.markPublished).toHaveBeenCalledTimes(1);
  });

  it('no dedup provider wired → publish succeeds without storing', async () => {
    const module = await buildModule(false);
    useCase = module.get<ProcessNextQueuedArticleUseCase>(
      ProcessNextQueuedArticleUseCase,
    );

    await expect(useCase.execute()).resolves.toBeUndefined();
    expect(queueRepo.markPublished).toHaveBeenCalledTimes(1);
  });
});
