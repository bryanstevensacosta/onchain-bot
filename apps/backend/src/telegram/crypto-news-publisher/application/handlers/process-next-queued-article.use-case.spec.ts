import { ProcessNextQueuedArticleUseCase } from './process-next-queued-article.use-case';
import { PublisherQueueRepository } from '../ports/publisher-queue.repository';
import { PublisherThrottleStateRepository } from '../ports/publisher-throttle-state.repository';
import { LlmConfigRepository } from '../ports/llm-config.repository';
import { ThrottleSchedulerService } from '../services/throttle-scheduler.service';
import { CryptoNewsLlmAdapter } from 'telegram/crypto-news-publisher/infrastructure/llm/crypto-news-llm.adapter';
import { TelegramPublisherPort, type SendResult } from 'telegram/shared';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { LlmConfig } from 'telegram/crypto-news-publisher/domain/entities/llm-config.entity';

const TEST_TARGET_CHANNEL = '@crypto-news-test';

const buildLlmConfig = (overrides: {
  targetChannel?: string;
  dailyCap?: number;
  dailyResetUtcHour?: number;
  randomDelayMinMs?: number;
  randomDelayMaxMs?: number;
  llmMaxAttempts?: number;
  defaultTemplateId?: string;
}): LlmConfig =>
  LlmConfig.load({
    defaultTemplateId: overrides.defaultTemplateId ?? 'tpl-default',
    targetChannel: overrides.targetChannel ?? TEST_TARGET_CHANNEL,
    enabled: true,
    dailyCap: overrides.dailyCap ?? 36,
    dailyResetUtcHour: overrides.dailyResetUtcHour ?? 4,
    randomDelayMinMs: overrides.randomDelayMinMs ?? 180_000,
    randomDelayMaxMs: overrides.randomDelayMaxMs ?? 900_000,
    llmMaxAttempts: overrides.llmMaxAttempts ?? 3,
  });

describe('ProcessNextQueuedArticleUseCase', () => {
  let useCase: ProcessNextQueuedArticleUseCase;
  let queueRepo: jest.Mocked<PublisherQueueRepository>;
  let throttleScheduler: jest.Mocked<ThrottleSchedulerService>;
  let llmAdapter: jest.Mocked<CryptoNewsLlmAdapter>;
  let publisher: jest.Mocked<TelegramPublisherPort>;
  let throttleStateRepo: jest.Mocked<PublisherThrottleStateRepository>;
  let llmConfigRepo: jest.Mocked<LlmConfigRepository>;

  const buildEntry = (overrides: {
    id?: string;
    attempts?: number;
    imagePath?: string | null;
    imagePaths?: string[];
  }): PublisherQueueEntry => {
    return PublisherQueueEntry.reconstitute({
      id: overrides.id ?? 'entry-1',
      channelId: 'crypto-news',
      messageId: 1,
      rawContent: 'BTC $100k',
      rawTitle: 'BTC $100k',
      imagePath: overrides.imagePath === undefined ? null : overrides.imagePath,
      imagePaths: overrides.imagePaths ?? [],
      groupedId: null,
      messageReceivedAt: new Date('2026-07-06T12:00:00Z'),
      keywordTemplateId: null,
      status: 'PENDING',
      publishedAt: null,
      telegramMessageId: null,
      lastError: null,
      attempts: overrides.attempts ?? 0,
    });
  };

  beforeEach(() => {
    queueRepo = {
      enqueue: jest.fn(),
      findNextPending: jest.fn(),
      markPublished: jest.fn(),
      markFailed: jest.fn(),
      incrementAttempts: jest.fn(),
      findAllForDisplay: jest.fn(),
      countPublishedToday: jest.fn(),
      findById: jest.fn(),
    };

    throttleScheduler = {
      getLastPublishAt: jest.fn(),
      setLastPublishAt: jest.fn(),
      shouldPublish: jest.fn(),
    };

    llmAdapter = {
      generateForEntry: jest.fn(),
      renderPromptFor: jest.fn(),
    };

    publisher = {
      sendMessage: jest.fn(),
      sendPhoto: jest.fn(),
      sendVideo: jest.fn(),
      sendMediaGroup: jest.fn(),
    };

    throttleStateRepo = {
      getLastPublishAt: jest.fn(),
      setLastPublishAt: jest.fn(),
      load: jest.fn(),
      save: jest.fn(),
    };

    llmConfigRepo = {
      load: jest.fn(),
      save: jest.fn(),
    };
    llmConfigRepo.load.mockResolvedValue(buildLlmConfig({}));

    useCase = new ProcessNextQueuedArticleUseCase(
      queueRepo,
      throttleScheduler,
      llmAdapter,
      publisher,
      throttleStateRepo,
      llmConfigRepo,
    );
  });

  const sendOk = (messageId: number): SendResult => ({
    ok: true,
    messageId,
    error: null,
  });

  const sendFail = (msg: string): SendResult => ({
    ok: false,
    messageId: null,
    error: msg,
  });

  describe('no-op paths', () => {
    it('skips when daily cap has been reached', async () => {
      queueRepo.countPublishedToday.mockResolvedValue(36);
      await useCase.execute();
      expect(queueRepo.findNextPending).not.toHaveBeenCalled();
      expect(llmAdapter.generateForEntry).not.toHaveBeenCalled();
      expect(publisher.sendPhoto).not.toHaveBeenCalled();
      expect(publisher.sendMessage).not.toHaveBeenCalled();
    });

    it('skips when the throttle says not yet', async () => {
      queueRepo.countPublishedToday.mockResolvedValue(10);
      throttleScheduler.shouldPublish.mockResolvedValue({
        canPublish: false,
        nextDelayMs: 60_000,
      });
      await useCase.execute();
      expect(queueRepo.findNextPending).not.toHaveBeenCalled();
    });

    it('skips when the queue is empty', async () => {
      queueRepo.countPublishedToday.mockResolvedValue(0);
      throttleScheduler.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      queueRepo.findNextPending.mockResolvedValue(null);
      await useCase.execute();
      expect(llmAdapter.generateForEntry).not.toHaveBeenCalled();
    });
  });

  describe('happy path with image', () => {
    it('calls sendPhoto, marks PUBLISHED, and updates lastPublishAt', async () => {
      const entry = buildEntry({
        id: 'entry-happy',
        imagePath: '/tmp/img.jpg',
        imagePaths: ['/tmp/img.jpg'],
      });
      queueRepo.countPublishedToday.mockResolvedValue(0);
      throttleScheduler.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      queueRepo.findNextPending.mockResolvedValue(entry);
      llmAdapter.generateForEntry.mockResolvedValue({
        content: '✨ BTC rompe $100k',
        systemPrompt: null,
        userPrompt: 'test prompt',
        temperature: 0.7,
        reasoningEffort: null,
        model: 'test-model',
      });
      publisher.sendPhoto.mockResolvedValue(sendOk(99_001));
      queueRepo.markPublished.mockResolvedValue(entry);
      throttleScheduler.setLastPublishAt.mockResolvedValue();

      await useCase.execute();

      expect(llmAdapter.generateForEntry).toHaveBeenCalledWith(entry);
      expect(publisher.sendPhoto).toHaveBeenCalledWith(
        TEST_TARGET_CHANNEL,
        '✨ BTC rompe $100k',
        '/tmp/img.jpg',
      );
      expect(publisher.sendMessage).not.toHaveBeenCalled();
      expect(queueRepo.markPublished).toHaveBeenCalledWith(
        'entry-happy',
        '99001',
        expect.objectContaining({
          content: '✨ BTC rompe $100k',
        }),
      );
      expect(throttleScheduler.setLastPublishAt).toHaveBeenCalledTimes(1);
      const persistedAt = throttleScheduler.setLastPublishAt.mock.calls[0][0];
      expect(persistedAt).toBeInstanceOf(Date);
    });
  });

  describe('happy path without image', () => {
    it('falls back to sendMessage when imagePath is null', async () => {
      const entry = buildEntry({
        id: 'entry-no-img',
        imagePath: null,
        imagePaths: [],
      });
      queueRepo.countPublishedToday.mockResolvedValue(0);
      throttleScheduler.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      queueRepo.findNextPending.mockResolvedValue(entry);
      llmAdapter.generateForEntry.mockResolvedValue('texto');
      publisher.sendMessage.mockResolvedValue(sendOk(99_002));
      queueRepo.markPublished.mockResolvedValue(entry);
      throttleScheduler.setLastPublishAt.mockResolvedValue();

      await useCase.execute();

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        TEST_TARGET_CHANNEL,
        'texto',
      );
      expect(publisher.sendPhoto).not.toHaveBeenCalled();
      expect(queueRepo.markPublished).toHaveBeenCalledWith(
        'entry-text',
        '99002',
      );
    });
  });

  describe('LLM failure', () => {
    it('increments attempts when below the max', async () => {
      const entry = buildEntry({ id: 'entry-llm', attempts: 0 });
      queueRepo.countPublishedToday.mockResolvedValue(0);
      throttleScheduler.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      queueRepo.findNextPending.mockResolvedValue(entry);
      llmAdapter.generateForEntry.mockRejectedValue(
        new Error('openai timeout'),
      );
      queueRepo.incrementAttempts.mockResolvedValue(entry);

      await useCase.execute();

      expect(queueRepo.incrementAttempts).toHaveBeenCalledWith('entry-llm');
      expect(queueRepo.markFailed).not.toHaveBeenCalled();
      expect(queueRepo.markPublished).not.toHaveBeenCalled();
      expect(throttleScheduler.setLastPublishAt).not.toHaveBeenCalled();
    });
  });

  describe('publish failure', () => {
    it('marks FAILED when telegram returns ok=false and attempts cap is reached', async () => {
      const entry = buildEntry({ id: 'entry-pub-fail', attempts: 2 });
      queueRepo.countPublishedToday.mockResolvedValue(0);
      throttleScheduler.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      queueRepo.findNextPending.mockResolvedValue(entry);
      llmAdapter.generateForEntry.mockResolvedValue('texto');
      publisher.sendMessage.mockResolvedValue(sendFail('rate limited'));
      queueRepo.markFailed.mockResolvedValue(entry);

      await useCase.execute();

      // attempts=2, llmMaxAttempts=3 → 2+1 is NOT < 3 → fail
      expect(queueRepo.markFailed).toHaveBeenCalledWith(
        'entry-pub-fail',
        'rate limited',
      );
      expect(queueRepo.incrementAttempts).not.toHaveBeenCalled();
      expect(queueRepo.markPublished).not.toHaveBeenCalled();
    });

    it('marks FAILED when telegram throws and attempts cap is reached', async () => {
      const entry = buildEntry({ id: 'entry-throw', attempts: 2 });
      queueRepo.countPublishedToday.mockResolvedValue(0);
      throttleScheduler.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      queueRepo.findNextPending.mockResolvedValue(entry);
      llmAdapter.generateForEntry.mockResolvedValue('texto');
      publisher.sendMessage.mockRejectedValue(new Error('network down'));
      queueRepo.markFailed.mockResolvedValue(entry);

      await useCase.execute();

      expect(queueRepo.markFailed).toHaveBeenCalledWith(
        'entry-throw',
        'network down',
      );
    });

    it('increments attempts when below the max-attempts cap', async () => {
      const entry = buildEntry({ id: 'entry-retry', attempts: 0 });
      queueRepo.countPublishedToday.mockResolvedValue(0);
      throttleScheduler.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      queueRepo.findNextPending.mockResolvedValue(entry);
      llmAdapter.generateForEntry.mockResolvedValue('texto');
      publisher.sendMessage.mockResolvedValue(sendFail('temporary'));
      queueRepo.incrementAttempts.mockResolvedValue(entry);

      await useCase.execute();

      // attempts=0, llmMaxAttempts=3 → 0+1 < 3 → increment
      expect(queueRepo.incrementAttempts).toHaveBeenCalledWith('entry-retry');
      expect(queueRepo.markFailed).not.toHaveBeenCalled();
    });

    it('marks FAILED when attempts have already reached the cap', async () => {
      const entry = buildEntry({ id: 'entry-cap', attempts: 2 });
      queueRepo.countPublishedToday.mockResolvedValue(0);
      throttleScheduler.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      queueRepo.findNextPending.mockResolvedValue(entry);
      llmAdapter.generateForEntry.mockResolvedValue('texto');
      publisher.sendMessage.mockResolvedValue(sendFail('permanent'));
      queueRepo.markFailed.mockResolvedValue(entry);

      await useCase.execute();

      // attempts=2, llmMaxAttempts=3 → 2+1 is NOT < 3 → fail
      expect(queueRepo.markFailed).toHaveBeenCalledWith(
        'entry-cap',
        'permanent',
      );
      expect(queueRepo.incrementAttempts).not.toHaveBeenCalled();
    });

    it('reads attempts cap from LlmConfig (per-tick override)', async () => {
      // Override the LlmConfig to set max attempts to 2 instead of 3.
      llmConfigRepo.load.mockResolvedValue(
        buildLlmConfig({ llmMaxAttempts: 2 }),
      );
      const entry = buildEntry({ id: 'entry-cap-2', attempts: 1 });
      queueRepo.countPublishedToday.mockResolvedValue(0);
      throttleScheduler.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      queueRepo.findNextPending.mockResolvedValue(entry);
      llmAdapter.generateForEntry.mockResolvedValue('texto');
      publisher.sendMessage.mockResolvedValue(sendFail('permanent'));
      queueRepo.markFailed.mockResolvedValue(entry);

      await useCase.execute();

      // attempts=1 + 1 = 2 is NOT < 2 → fail (cap honored from config)
      expect(queueRepo.markFailed).toHaveBeenCalledWith(
        'entry-cap-2',
        'permanent',
      );
    });

    it('does not mark FAILED on publisher-not-configured errors', async () => {
      const entry = buildEntry({ id: 'entry-no-cfg', attempts: 5 });
      queueRepo.countPublishedToday.mockResolvedValue(0);
      throttleScheduler.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      queueRepo.findNextPending.mockResolvedValue(entry);
      llmAdapter.generateForEntry.mockResolvedValue('texto');
      publisher.sendMessage.mockResolvedValue(
        sendFail('CRYPTO_NEWS_BOT_TOKEN is not set'),
      );

      await useCase.execute();

      expect(queueRepo.markFailed).not.toHaveBeenCalled();
      expect(queueRepo.markPublished).not.toHaveBeenCalled();
      expect(throttleScheduler.setLastPublishAt).not.toHaveBeenCalled();
    });
  });

  describe('orchestration invariants', () => {
    it('always calls countPublishedToday exactly once', async () => {
      queueRepo.countPublishedToday.mockResolvedValue(36);
      await useCase.execute();
      expect(queueRepo.countPublishedToday).toHaveBeenCalledTimes(1);
    });

    it('passes the configured dailyResetUtcHour (4) to countPublishedToday', async () => {
      queueRepo.countPublishedToday.mockResolvedValue(36);
      await useCase.execute();
      expect(queueRepo.countPublishedToday).toHaveBeenCalledWith(4);
    });

    it('reads targetChannel from LlmConfig (not the JSON file)', async () => {
      llmConfigRepo.load.mockResolvedValue(
        buildLlmConfig({ targetChannel: '@from-config-row' }),
      );
      const entry = buildEntry({
        id: 'entry-target',
        imagePath: null,
        imagePaths: [],
      });
      queueRepo.countPublishedToday.mockResolvedValue(0);
      throttleScheduler.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      queueRepo.findNextPending.mockResolvedValue(entry);
      llmAdapter.generateForEntry.mockResolvedValue({
        content: 'texto',
        systemPrompt: null,
        userPrompt: 'test',
        temperature: null,
        reasoningEffort: null,
        model: 'test',
      });
      publisher.sendMessage.mockResolvedValue(sendOk(99_100));
      queueRepo.markPublished.mockResolvedValue(entry);
      throttleScheduler.setLastPublishAt.mockResolvedValue();

      await useCase.execute();

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '@from-config-row',
        'texto',
      );
    });
  });
});
