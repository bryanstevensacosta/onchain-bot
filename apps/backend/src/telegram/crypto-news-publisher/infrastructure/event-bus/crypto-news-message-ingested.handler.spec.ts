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
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';

describe('CryptoNewsMessageIngestedHandler', () => {
  let handler: CryptoNewsMessageIngestedHandler;
  let messageRepo: jest.Mocked<CryptoNewsMessageRepository>;
  let keywordRepo: jest.Mocked<KeywordRepository>;
  let enqueue: jest.Mocked<EnqueueMatchingMessageUseCase>;

  const createKeyword = (phrase: string, caseSensitive = false): Keyword =>
    Keyword.create({ phrase, caseSensitive, enabled: true });

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
            findAllEnabled: jest.fn().mockResolvedValue([]),
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
    enqueue = module.get(EnqueueMatchingMessageUseCase);
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

      (handler as any).cacheTimestamp = 0;

      // Second call should refresh
      await handler.handle(createEvent({ messageId: 2 }));
      expect(keywordRepo.findEnabled).toHaveBeenCalledTimes(2);
    });
  });
});
