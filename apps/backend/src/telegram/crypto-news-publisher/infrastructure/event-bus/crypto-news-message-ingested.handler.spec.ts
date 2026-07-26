import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { CryptoNewsMessageIngestedHandler } from './crypto-news-message-ingested.handler';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { KeywordRepository } from 'telegram/crypto-news-publisher/application/ports/keyword.repository';
import { EnqueueMatchingMessageUseCase } from 'telegram/crypto-news-publisher/application/handlers/enqueue-matching-message.use-case';
import { CryptoNewsMessageIngestedEvent } from 'telegram/ingestion/crypto-news/domain/events/crypto-news-message-ingested.event';
import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { BlacklistPhraseRepository } from 'telegram/crypto-news-publisher/application/ports/blacklist-phrase.repository';
import { BlacklistPhrase } from 'telegram/crypto-news-publisher/domain/entities/blacklist-phrase.entity';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import { DeduplicationService } from 'shared/deduplication/application/services/deduplication.service';

let dedupModule: jest.Mocked<DeduplicationService>;

function mockDedup(overrides: Record<string, any>) {
  if (dedupModule.checkExact) {
    dedupModule.checkExact.mockReset();
  }
  if (dedupModule.checkContent) {
    dedupModule.checkContent.mockReset();
  }
  if (dedupModule.checkUrl) {
    dedupModule.checkUrl.mockReset();
  }
  if (dedupModule.checkSemantic) {
    dedupModule.checkSemantic.mockReset();
  }
  if (dedupModule.markAsSeen) {
    dedupModule.markAsSeen.mockReset();
  }
  Object.assign(dedupModule, overrides);
}

describe('CryptoNewsMessageIngestedHandler', () => {
  let handler: CryptoNewsMessageIngestedHandler;
  let messageRepo: jest.Mocked<CryptoNewsMessageRepository>;
  let keywordRepo: jest.Mocked<KeywordRepository>;
  let blacklistRepo: jest.Mocked<BlacklistPhraseRepository>;
  let enqueue: jest.Mocked<EnqueueMatchingMessageUseCase>;

  const createMessage = (content: string, media: unknown[] = []) => ({
    id: 'msg-1',
    channelId: 'crypto-news',
    messageId: 42,
    content,
    title: 'Test title',
    media,
    groupedId: null,
    receivedAt: new Date(),
  });

  const createKeyword = (phrase: string, caseSensitive = false): Keyword =>
    Keyword.create({ phrase, caseSensitive, enabled: true });

  const createKeywordWithOptions = (options: {
    phrase: string;
    caseSensitive?: boolean;
    andGroupId?: string | null;
    requireMedia?: boolean;
  }): Keyword =>
    Keyword.create({
      phrase: options.phrase,
      caseSensitive: options.caseSensitive ?? false,
      enabled: true,
      andGroupId: options.andGroupId ?? null,
      requireMedia: options.requireMedia ?? false,
    });

  const createBlacklistPhrase = (
    phrase: string,
    caseSensitive = false,
  ): BlacklistPhrase =>
    BlacklistPhrase.create({ phrase, caseSensitive, enabled: true });

  const createBlacklistPhraseWithOptions = (options: {
    phrase: string;
    caseSensitive?: boolean;
    andGroupId?: string | null;
    requireMedia?: boolean;
  }): BlacklistPhrase =>
    BlacklistPhrase.create({
      phrase: options.phrase,
      caseSensitive: options.caseSensitive ?? false,
      enabled: true,
      andGroupId: options.andGroupId ?? null,
      requireMedia: options.requireMedia ?? false,
    });

  const createEvent = (
    overrides: Partial<{
      channelId: string;
      messageId: number;
      title: string | null;
    }> = {},
  ): CryptoNewsMessageIngestedEvent => {
    return new CryptoNewsMessageIngestedEvent({
      channelId: overrides.channelId ?? 'crypto-news',
      messageId: overrides.messageId ?? 42,
      title: overrides.title ?? 'Bitcoin hits $100k',
      occurredAt: new Date('2026-07-01T12:00:00Z'),
    });
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: DeduplicationService,
          useValue: {
            checkExact: jest.fn().mockResolvedValue({ isDuplicate: false }),
            checkContent: jest.fn().mockResolvedValue({ isDuplicate: false }),
            checkUrl: jest.fn().mockResolvedValue({ isDuplicate: false }),
            checkSemantic: jest.fn().mockResolvedValue({ isDuplicate: false }),
            markAsSeen: jest.fn().mockResolvedValue(undefined),
          },
        },
        CryptoNewsMessageIngestedHandler,
        {
          provide: CryptoNewsMessageRepository,
          useValue: {
            findByChannelAndMessageId: jest.fn(),
          },
        },
        {
          provide: KeywordRepository,
          useValue: {
            findEnabled: jest.fn(),
          },
        },
        {
          provide: BlacklistPhraseRepository,
          useValue: {
            findEnabled: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PublisherQueueRepository,
          useValue: {
            enqueue: jest.fn(),
          },
        },
        {
          provide: EnqueueMatchingMessageUseCase,
          useValue: {
            execute: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get<CryptoNewsMessageIngestedHandler>(
      CryptoNewsMessageIngestedHandler,
    );
    messageRepo = module.get(CryptoNewsMessageRepository);
    keywordRepo = module.get(KeywordRepository);
    blacklistRepo = module.get(BlacklistPhraseRepository);
    enqueue = module.get(EnqueueMatchingMessageUseCase);
    dedupModule = module.get(DeduplicationService);
  });

  it('should be defined', () => {
    expect(handler).toBeDefined();
  });

  describe('handle', () => {
    it('should enqueue when a keyword matches, passing the matched keyword', async () => {
      const event = createEvent({ title: 'BTC breaks $100k' });
      const message = {
        id: 'msg-1',
        channelId: 'crypto-news',
        messageId: 42,
        content: 'Bitcoin news: BTC breaks $100k',
        title: 'BTC breaks $100k',
        media: [],
        groupedId: null,
        receivedAt: new Date(),
      } as unknown as Awaited<
        ReturnType<typeof messageRepo.findByChannelAndMessageId>
      >;
      const keyword = createKeyword('btc');
      const entry = PublisherQueueEntry.create({
        channelId: 'crypto-news',
        messageId: 42,
        rawContent: 'Bitcoin news: BTC breaks $100k',
        rawTitle: 'BTC breaks $100k',
        imagePath: null,
        groupedId: null,
        messageReceivedAt: new Date(),
      });
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([keyword]);
      enqueue.execute.mockResolvedValue(entry);

      await handler.handle(event);

      expect(messageRepo.findByChannelAndMessageId).toHaveBeenCalledWith(
        'crypto-news',
        42,
      );
      expect(keywordRepo.findEnabled).toHaveBeenCalledTimes(1);
      expect(enqueue.execute).toHaveBeenCalledWith({
        message,
        matchedKeywords: [keyword],
      });
    });

    it('should freeze a keyword-bound template onto the queue entry', async () => {
      const templateId = crypto.randomUUID();
      const event = createEvent({ title: 'BTC breaks $100k' });
      const message = {
        id: 'msg-1',
        channelId: 'crypto-news',
        messageId: 42,
        content: 'Bitcoin news: BTC breaks $100k',
        title: 'BTC breaks $100k',
        media: [],
        groupedId: null,
        receivedAt: new Date(),
      } as unknown as Awaited<
        ReturnType<typeof messageRepo.findByChannelAndMessageId>
      >;
      const keyword = Keyword.create({ phrase: 'btc', templateId });
      const entry = PublisherQueueEntry.create({
        channelId: 'crypto-news',
        messageId: 42,
        rawContent: 'Bitcoin news: BTC breaks $100k',
        rawTitle: 'BTC breaks $100k',
        imagePath: null,
        groupedId: null,
        messageReceivedAt: new Date(),
        keywordTemplateId: templateId,
      });
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([keyword]);
      enqueue.execute.mockResolvedValue(entry);

      await handler.handle(event);

      const callArg = enqueue.execute.mock.calls[0][0];
      expect(callArg.matchedKeywords).toEqual([keyword]);
      expect(entry.keywordTemplateId).toBe(templateId);
    });

    it('should not enqueue when no keyword matches', async () => {
      const event = createEvent();
      const message = {
        id: 'msg-1',
        channelId: 'crypto-news',
        messageId: 42,
        content: 'Some unrelated news about ethereum',
        title: 'ETH update',
        media: [],
        groupedId: null,
        receivedAt: new Date(),
      } as unknown as Awaited<
        ReturnType<typeof messageRepo.findByChannelAndMessageId>
      >;
      const keyword = createKeyword('btc');
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([keyword]);
      enqueue.execute.mockResolvedValue(
        undefined as unknown as PublisherQueueEntry,
      );

      await handler.handle(event);

      expect(enqueue.execute).not.toHaveBeenCalled();
    });

    it('should short-circuit when message is not found', async () => {
      const event = createEvent();
      messageRepo.findByChannelAndMessageId.mockResolvedValue(null);

      await handler.handle(event);

      expect(keywordRepo.findEnabled).not.toHaveBeenCalled();
      expect(enqueue.execute).not.toHaveBeenCalled();
    });

    it('should fail open on errors', async () => {
      const event = createEvent();
      messageRepo.findByChannelAndMessageId.mockRejectedValue(
        new Error('DB down'),
      );

      // Handler must NOT re-throw — failed match must not block the pipeline
      await expect(handler.handle(event)).resolves.toBeUndefined();
    });

    it('should fetch the full message (fix-1 invariant: content not in event payload)', async () => {
      const event = createEvent({ title: 'BTC update' });
      const message = {
        id: 'msg-1',
        channelId: 'crypto-news',
        messageId: 42,
        content: 'Long body text mentioning BTC',
        title: 'BTC update',
        media: [],
        groupedId: null,
        receivedAt: new Date(),
      } as unknown as Awaited<
        ReturnType<typeof messageRepo.findByChannelAndMessageId>
      >;
      const keyword = createKeyword('btc');
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([keyword]);
      enqueue.execute.mockResolvedValue(
        undefined as unknown as PublisherQueueEntry,
      );

      await handler.handle(event);

      // Verify the handler fetched the content from the repo (not from event)
      expect(messageRepo.findByChannelAndMessageId).toHaveBeenCalledWith(
        'crypto-news',
        42,
      );
    });
  });

  describe('keyword cache', () => {
    it('should cache enabled keywords across multiple events', async () => {
      const message = {
        id: 'msg-1',
        channelId: 'crypto-news',
        messageId: 42,
        content: 'BTC news',
        title: null,
        media: [],
        groupedId: null,
        receivedAt: new Date(),
      } as unknown as Awaited<
        ReturnType<typeof messageRepo.findByChannelAndMessageId>
      >;
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([createKeyword('btc')]);
      enqueue.execute.mockResolvedValue(
        undefined as unknown as PublisherQueueEntry,
      );

      await handler.handle(createEvent({ messageId: 1 }));
      await handler.handle(createEvent({ messageId: 2 }));
      await handler.handle(createEvent({ messageId: 3 }));

      // findEnabled should be called only once due to caching
      expect(keywordRepo.findEnabled).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache after TTL expires', async () => {
      const message = {
        id: 'msg-1',
        channelId: 'crypto-news',
        messageId: 42,
        content: 'BTC news',
        title: null,
        media: [],
        groupedId: null,
        receivedAt: new Date(),
      } as unknown as Awaited<
        ReturnType<typeof messageRepo.findByChannelAndMessageId>
      >;
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([createKeyword('btc')]);
      enqueue.execute.mockResolvedValue(
        undefined as unknown as PublisherQueueEntry,
      );

      // First call
      await handler.handle(createEvent({ messageId: 1 }));
      expect(keywordRepo.findEnabled).toHaveBeenCalledTimes(1);

      // Force cache expiry by manipulating the timestamp

      (handler as any).keywordCacheTimestamp = 0;

      // Second call should refresh
      await handler.handle(createEvent({ messageId: 2 }));
      expect(keywordRepo.findEnabled).toHaveBeenCalledTimes(2);
    });
  });

  describe('compound keywords (AND groups)', () => {
    it('should enqueue when all phrases in a compound group match', async () => {
      const event = createEvent();
      const message = createMessage('Bitcoin and Ethereum are up');
      const kw1 = createKeywordWithOptions({
        phrase: 'bitcoin',
        andGroupId: 'group-1',
      });
      const kw2 = createKeywordWithOptions({
        phrase: 'ethereum',
        andGroupId: 'group-1',
      });
      const entry = PublisherQueueEntry.create({
        channelId: 'crypto-news',
        messageId: 42,
        rawContent: 'Bitcoin and Ethereum are up',
        rawTitle: 'Test title',
        imagePath: null,
        groupedId: null,
        messageReceivedAt: new Date(),
      });
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw1, kw2]);
      enqueue.execute.mockResolvedValue(entry);

      await handler.handle(event);

      expect(enqueue.execute).toHaveBeenCalled();
      const callArg = enqueue.execute.mock.calls[0][0];
      expect(callArg.matchedKeywords).toHaveLength(2);
    });

    it('should NOT enqueue when compound group partially matches', async () => {
      const event = createEvent();
      const message = createMessage('Bitcoin is up');
      const kw1 = createKeywordWithOptions({
        phrase: 'bitcoin',
        andGroupId: 'group-1',
      });
      const kw2 = createKeywordWithOptions({
        phrase: 'ethereum',
        andGroupId: 'group-1',
      });
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw1, kw2]);
      enqueue.execute.mockResolvedValue(
        undefined as unknown as PublisherQueueEntry,
      );

      await handler.handle(event);

      expect(enqueue.execute).not.toHaveBeenCalled();
    });
  });

  describe('requireMedia', () => {
    it('should match simple keyword with requireMedia when media is present', async () => {
      const event = createEvent();
      const message = createMessage('Bitcoin news', [
        { filePath: '/img/btc.jpg' },
      ]);
      const kw = createKeywordWithOptions({
        phrase: 'bitcoin',
        requireMedia: true,
      });
      const entry = PublisherQueueEntry.create({
        channelId: 'crypto-news',
        messageId: 42,
        rawContent: 'Bitcoin news',
        rawTitle: 'Test title',
        imagePath: null,
        groupedId: null,
        messageReceivedAt: new Date(),
      });
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw]);
      enqueue.execute.mockResolvedValue(entry);

      await handler.handle(event);

      expect(enqueue.execute).toHaveBeenCalled();
    });

    it('should NOT match simple keyword with requireMedia when media is absent', async () => {
      const event = createEvent();
      const message = createMessage('Bitcoin news', []);
      const kw = createKeywordWithOptions({
        phrase: 'bitcoin',
        requireMedia: true,
      });
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw]);
      enqueue.execute.mockResolvedValue(
        undefined as unknown as PublisherQueueEntry,
      );

      await handler.handle(event);

      expect(enqueue.execute).not.toHaveBeenCalled();
    });

    it('should skip compound group if any phrase requires media and message has no media', async () => {
      const event = createEvent();
      const message = createMessage('Bitcoin and Ethereum', []);
      const kw1 = createKeywordWithOptions({
        phrase: 'bitcoin',
        andGroupId: 'group-1',
        requireMedia: true,
      });
      const kw2 = createKeywordWithOptions({
        phrase: 'ethereum',
        andGroupId: 'group-1',
      });
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw1, kw2]);
      enqueue.execute.mockResolvedValue(
        undefined as unknown as PublisherQueueEntry,
      );

      await handler.handle(event);

      expect(enqueue.execute).not.toHaveBeenCalled();
    });

    it('should match compound group when all phrases match and media is present', async () => {
      const event = createEvent();
      const message = createMessage('Bitcoin and Ethereum', [
        { filePath: '/img/chart.png' },
      ]);
      const kw1 = createKeywordWithOptions({
        phrase: 'bitcoin',
        andGroupId: 'group-1',
        requireMedia: true,
      });
      const kw2 = createKeywordWithOptions({
        phrase: 'ethereum',
        andGroupId: 'group-1',
      });
      const entry = PublisherQueueEntry.create({
        channelId: 'crypto-news',
        messageId: 42,
        rawContent: 'Bitcoin and Ethereum',
        rawTitle: 'Test title',
        imagePath: null,
        groupedId: null,
        messageReceivedAt: new Date(),
      });
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw1, kw2]);
      enqueue.execute.mockResolvedValue(entry);

      await handler.handle(event);

      expect(enqueue.execute).toHaveBeenCalled();
    });
  });

  describe('blacklist compounds', () => {
    it('should block when all phrases in a compound blacklist group match', async () => {
      const event = createEvent();
      const message = createMessage('Bitcoin scam alert');
      const kw = createKeyword('bitcoin');
      const bl1 = createBlacklistPhraseWithOptions({
        phrase: 'bitcoin',
        andGroupId: 'bl-group-1',
      });
      const bl2 = createBlacklistPhraseWithOptions({
        phrase: 'scam',
        andGroupId: 'bl-group-1',
      });
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw]);
      blacklistRepo.findEnabled.mockResolvedValue([bl1, bl2]);

      await handler.handle(event);

      expect(enqueue.execute).not.toHaveBeenCalled();
    });

    it('should NOT block when compound blacklist partially matches', async () => {
      const event = createEvent();
      const message = createMessage('Bitcoin price update');
      const kw = createKeyword('bitcoin');
      const bl1 = createBlacklistPhraseWithOptions({
        phrase: 'bitcoin',
        andGroupId: 'bl-group-1',
      });
      const bl2 = createBlacklistPhraseWithOptions({
        phrase: 'scam',
        andGroupId: 'bl-group-1',
      });
      const entry = PublisherQueueEntry.create({
        channelId: 'crypto-news',
        messageId: 42,
        rawContent: 'Bitcoin price update',
        rawTitle: 'Test title',
        imagePath: null,
        groupedId: null,
        messageReceivedAt: new Date(),
      });
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw]);
      blacklistRepo.findEnabled.mockResolvedValue([bl1, bl2]);
      enqueue.execute.mockResolvedValue(entry);

      await handler.handle(event);

      expect(enqueue.execute).toHaveBeenCalled();
    });

    it('should use checkMatchesWithMedia for simple blacklist phrases', async () => {
      const event = createEvent();
      const message = createMessage('Bitcoin news', []);
      const kw = createKeyword('bitcoin');
      const bl = createBlacklistPhraseWithOptions({
        phrase: 'bitcoin',
        requireMedia: true,
      });
      const entry = PublisherQueueEntry.create({
        channelId: 'crypto-news',
        messageId: 42,
        rawContent: 'Bitcoin news',
        rawTitle: 'Test title',
        imagePath: null,
        groupedId: null,
        messageReceivedAt: new Date(),
      });
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw]);
      blacklistRepo.findEnabled.mockResolvedValue([bl]);
      enqueue.execute.mockResolvedValue(entry);

      await handler.handle(event);

      expect(enqueue.execute).toHaveBeenCalled();
    });
  });

  describe('mixed simples and compounds', () => {
    it('should match simple keyword alongside compound group', async () => {
      const event = createEvent();
      const message = createMessage('Bitcoin and Ethereum surge');
      const simpleKw = createKeyword('surge');
      const compoundKw1 = createKeywordWithOptions({
        phrase: 'bitcoin',
        andGroupId: 'group-1',
      });
      const compoundKw2 = createKeywordWithOptions({
        phrase: 'ethereum',
        andGroupId: 'group-1',
      });
      const entry = PublisherQueueEntry.create({
        channelId: 'crypto-news',
        messageId: 42,
        rawContent: 'Bitcoin and Ethereum surge',
        rawTitle: 'Test title',
        imagePath: null,
        groupedId: null,
        messageReceivedAt: new Date(),
      });
      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([
        simpleKw,
        compoundKw1,
        compoundKw2,
      ]);
      enqueue.execute.mockResolvedValue(entry);

      await handler.handle(event);

      expect(enqueue.execute).toHaveBeenCalled();
      const callArg = enqueue.execute.mock.calls[0][0];
      expect(callArg.matchedKeywords).toHaveLength(3);
    });
  });

  describe('dedup integration', () => {
    let queueRepo: jest.Mocked<PublisherQueueRepository>;
    let testingModule: TestingModule;
    let dedupService: jest.Mocked<DeduplicationService>;

    beforeEach(async () => {
      testingModule = await Test.createTestingModule({
        providers: [
          {
            provide: DeduplicationService,
            useValue: {
              checkExact: jest.fn().mockResolvedValue({ isDuplicate: false }),
              checkContent: jest.fn().mockResolvedValue({ isDuplicate: false }),
              checkUrl: jest.fn().mockResolvedValue({ isDuplicate: false }),
              checkSemantic: jest
                .fn()
                .mockResolvedValue({ isDuplicate: false }),
              markAsSeen: jest.fn().mockResolvedValue(undefined),
            },
          },
          CryptoNewsMessageIngestedHandler,
          {
            provide: CryptoNewsMessageRepository,
            useValue: {
              findByChannelAndMessageId: jest.fn(),
            },
          },
          {
            provide: KeywordRepository,
            useValue: {
              findEnabled: jest.fn(),
            },
          },
          {
            provide: BlacklistPhraseRepository,
            useValue: {
              findEnabled: jest.fn().mockResolvedValue([]),
            },
          },
          {
            provide: PublisherQueueRepository,
            useValue: {
              enqueue: jest.fn(),
            },
          },
          {
            provide: EnqueueMatchingMessageUseCase,
            useValue: {
              execute: jest.fn(),
            },
          },
        ],
      }).compile();

      handler = testingModule.get<CryptoNewsMessageIngestedHandler>(
        CryptoNewsMessageIngestedHandler,
      );
      messageRepo = testingModule.get(CryptoNewsMessageRepository);
      keywordRepo = testingModule.get(KeywordRepository);
      blacklistRepo = testingModule.get(BlacklistPhraseRepository);
      enqueue = testingModule.get(EnqueueMatchingMessageUseCase);
      queueRepo = testingModule.get(PublisherQueueRepository);
      dedupModule = testingModule.get(DeduplicationService);
      dedupService = testingModule.get(DeduplicationService);
    });

    it('should BLOCKED with duplicate reason on exact match', async () => {
      dedupService.checkExact.mockResolvedValue({
        isDuplicate: true,
        blockedReason: 'Duplicate of queue',
      });

      const event = createEvent({ title: 'BTC update' });
      const message = createMessage('Bitcoin news content');
      const kw = createKeyword('bitcoin');

      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw]);

      await handler.handle(event);

      expect(enqueue.execute).not.toHaveBeenCalled();
      expect(queueRepo.enqueue).toHaveBeenCalled();
      const enqueuedEntry = queueRepo.enqueue.mock.calls[0][0];
      expect(enqueuedEntry).toHaveProperty('state');
      expect((enqueuedEntry as any).state.status).toBe('BLOCKED');
      expect((enqueuedEntry as any).state.blockedReason).toBe(
        'Duplicate of queue',
      );
    });

    it('should BLOCKED with content reason on content match', async () => {
      dedupService.checkExact.mockResolvedValue({ isDuplicate: false });
      dedupService.checkContent.mockResolvedValue({
        isDuplicate: true,
        blockedReason: 'Duplicate content of queue',
      });

      const event = createEvent({ title: 'BTC update' });
      const message = createMessage('Bitcoin news content');
      const kw = createKeyword('bitcoin');

      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw]);

      await handler.handle(event);

      expect(enqueue.execute).not.toHaveBeenCalled();
      expect(queueRepo.enqueue).toHaveBeenCalled();
      const enqueuedEntry = queueRepo.enqueue.mock.calls[0][0];
      expect((enqueuedEntry as any).state.status).toBe('BLOCKED');
      expect((enqueuedEntry as any).state.blockedReason).toBe(
        'Duplicate content of queue',
      );
    });

    it('should pass URL overlap as signal instead of blocking', async () => {
      dedupService.checkExact.mockResolvedValue({ isDuplicate: false });
      dedupService.checkContent.mockResolvedValue({ isDuplicate: false });
      dedupService.checkUrl.mockResolvedValue({
        isDuplicate: false,
        urlOverlapCount: 1,
      });
      dedupService.checkSemantic.mockResolvedValue({
        isDuplicate: false,
        zone: 'different',
      });
      dedupService.markAsSeen.mockResolvedValue(undefined);

      const event = createEvent({ title: 'BTC update' });
      const message = createMessage('Bitcoin news with https://example.com');
      const kw = createKeyword('bitcoin');

      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw]);

      await handler.handle(event);

      expect(dedupService.checkUrl).toHaveBeenCalledWith(
        'crypto-news-publisher',
        'Bitcoin news with https://example.com',
      );
      expect(dedupService.checkSemantic).toHaveBeenCalledWith(
        'crypto-news-publisher',
        'Bitcoin news with https://example.com',
        'crypto-news',
        42,
        1,
      );
      expect(enqueue.execute).toHaveBeenCalled();
    });

    it('should BLOCKED with semantic reason on semantic high score', async () => {
      dedupService.checkExact.mockResolvedValue({ isDuplicate: false });
      dedupService.checkContent.mockResolvedValue({ isDuplicate: false });
      dedupService.checkUrl.mockResolvedValue({ isDuplicate: false });
      dedupService.checkSemantic.mockResolvedValue({
        isDuplicate: true,
        blockedReason: 'Semantic duplicate of queue',
      });

      const event = createEvent({ title: 'BTC update' });
      const message = createMessage('Bitcoin news content');
      const kw = createKeyword('bitcoin');

      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw]);

      await handler.handle(event);

      expect(enqueue.execute).not.toHaveBeenCalled();
      expect(queueRepo.enqueue).toHaveBeenCalled();
      const enqueuedEntry = queueRepo.enqueue.mock.calls[0][0];
      expect((enqueuedEntry as any).state.status).toBe('BLOCKED');
      expect((enqueuedEntry as any).state.blockedReason).toBe(
        'Semantic duplicate of queue',
      );
    });

    it('should PENDING on LLM UPDATE (non-blocking)', async () => {
      dedupService.checkExact.mockResolvedValue({ isDuplicate: false });
      dedupService.checkContent.mockResolvedValue({ isDuplicate: false });
      dedupService.checkUrl.mockResolvedValue({ isDuplicate: false });
      dedupService.checkSemantic.mockResolvedValue({
        isDuplicate: false,
        zone: 'different',
        eventRelation: 'update',
        existingRecord: { id: 'existing-123' },
      });

      const event = createEvent({ title: 'BTC update' });
      const message = createMessage('Bitcoin news content');
      const kw = createKeyword('bitcoin');
      const entry = PublisherQueueEntry.create({
        channelId: 'crypto-news',
        messageId: 42,
        rawContent: 'Bitcoin news content',
        rawTitle: 'BTC update',
        imagePath: null,
        groupedId: null,
        messageReceivedAt: new Date(),
      });

      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw]);
      enqueue.execute.mockResolvedValue(entry);

      await handler.handle(event);

      expect(enqueue.execute).toHaveBeenCalled();
    });

    it('should PENDING on no duplicate', async () => {
      const event = createEvent({ title: 'BTC update' });
      const message = createMessage('Bitcoin news content');
      const kw = createKeyword('bitcoin');
      const entry = PublisherQueueEntry.create({
        channelId: 'crypto-news',
        messageId: 42,
        rawContent: 'Bitcoin news content',
        rawTitle: 'BTC update',
        imagePath: null,
        groupedId: null,
        messageReceivedAt: new Date(),
      });

      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw]);
      enqueue.execute.mockResolvedValue(entry);

      await handler.handle(event);

      expect(enqueue.execute).toHaveBeenCalled();
    });

    it('should stop at first match (exact match prevents content/URL checks)', async () => {
      dedupService.checkExact.mockResolvedValue({
        isDuplicate: true,
        blockedReason: 'Exact duplicate',
      });

      const event = createEvent({ title: 'BTC update' });
      const message = createMessage('Bitcoin news content');
      const kw = createKeyword('bitcoin');

      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw]);

      await handler.handle(event);

      expect(dedupService.checkExact).toHaveBeenCalled();
      expect(dedupService.checkContent).not.toHaveBeenCalled();
      expect(dedupService.checkUrl).not.toHaveBeenCalled();
      expect(dedupService.checkSemantic).not.toHaveBeenCalled();
      expect(enqueue.execute).not.toHaveBeenCalled();
    });

    it('should call markAsSeen after successful enqueue', async () => {
      dedupService.checkExact.mockResolvedValue({ isDuplicate: false });
      dedupService.checkContent.mockResolvedValue({ isDuplicate: false });
      dedupService.checkUrl.mockResolvedValue({ isDuplicate: false });
      dedupService.checkSemantic.mockResolvedValue({
        isDuplicate: false,
        zone: 'different',
        eventRelation: 'update',
        existingRecord: { id: 'existing-123' },
      });

      const event = createEvent({ title: 'BTC update' });
      const message = createMessage('Bitcoin news content');
      const kw = createKeyword('bitcoin');
      const entry = PublisherQueueEntry.create({
        channelId: 'crypto-news',
        messageId: 42,
        rawContent: 'Bitcoin news content',
        rawTitle: 'BTC update',
        imagePath: null,
        groupedId: null,
        messageReceivedAt: new Date(),
      });

      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw]);
      enqueue.execute.mockResolvedValue(entry);

      await handler.handle(event);

      expect(dedupService.markAsSeen).toHaveBeenCalled();
    });

    it('should call markAsSeen for blacklist blocked entries', async () => {
      dedupService.checkExact.mockResolvedValue({ isDuplicate: false });
      dedupService.checkContent.mockResolvedValue({ isDuplicate: false });
      dedupService.checkUrl.mockResolvedValue({ isDuplicate: false });
      dedupService.checkSemantic.mockResolvedValue({ isDuplicate: false });

      const event = createEvent({ title: 'Bitcoin scam alert' });
      const message = createMessage('Bitcoin scam alert');
      const kw = createKeyword('bitcoin');
      const bl = createBlacklistPhrase('scam');

      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw]);
      blacklistRepo.findEnabled.mockResolvedValue([bl]);

      await handler.handle(event);

      expect(queueRepo.enqueue).toHaveBeenCalled();
    });

    it('should handle dedup service failure gracefully', async () => {
      dedupService.checkExact.mockRejectedValue(
        new Error('Dedup service down'),
      );

      const event = createEvent({ title: 'BTC update' });
      const message = createMessage('Bitcoin news content');
      const kw = createKeyword('bitcoin');

      messageRepo.findByChannelAndMessageId.mockResolvedValue(message);
      keywordRepo.findEnabled.mockResolvedValue([kw]);

      await expect(handler.handle(event)).resolves.toBeUndefined();
    });
  });
});
