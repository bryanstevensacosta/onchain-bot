import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ProcessCryptoNewsMessageHandler } from './process-crypto-news-message.handler';
import { FilteredCryptoNewsService } from '../services/filtered-crypto-news.service';
import { EnqueueMatchingMessageUseCase } from '../../../crypto-news-publisher/application/handlers/enqueue-matching-message.use-case';
import { MatchingConfigRepository } from '../ports/matching-config.repository';
import { PublisherQueueRepository } from '../../../crypto-news-publisher/application/ports/publisher-queue.repository';
import { TelegramRawMessage } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';

describe('ProcessCryptoNewsMessageHandler - Latency Measurement', () => {
  let handler: ProcessCryptoNewsMessageHandler;
  let filteredNewsService: jest.Mocked<FilteredCryptoNewsService>;
  let enqueueUseCase: jest.Mocked<EnqueueMatchingMessageUseCase>;
  let matchingConfigRepo: jest.Mocked<MatchingConfigRepository>;
  let queueRepo: jest.Mocked<PublisherQueueRepository>;
  let loggerSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessCryptoNewsMessageHandler,
        {
          provide: FilteredCryptoNewsService,
          useValue: {
            getMatchingMessages: jest.fn(),
          },
        },
        {
          provide: EnqueueMatchingMessageUseCase,
          useValue: {
            execute: jest.fn(),
          },
        },
        {
          provide: MatchingConfigRepository,
          useValue: {
            load: jest.fn(),
          },
        },
        {
          provide: PublisherQueueRepository,
          useValue: {
            findByChannelIdAndMessageId: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get<ProcessCryptoNewsMessageHandler>(
      ProcessCryptoNewsMessageHandler,
    );
    filteredNewsService = module.get(FilteredCryptoNewsService);
    enqueueUseCase = module.get(EnqueueMatchingMessageUseCase);
    matchingConfigRepo = module.get(MatchingConfigRepository);
    queueRepo = module.get(PublisherQueueRepository);

    // Spy on logger methods
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Latency Logging', () => {
    const mockRawMessage: TelegramRawMessage = {
      peerId: '-100123456789',
      messageId: 42,
      text: 'Test message',
      occurredAt: new Date(),
      messageType: 'crypto-news',
      senderId: 'test-sender',
      date: new Date(),
    };

    beforeEach(() => {
      // Setup common mocks
      matchingConfigRepo.load.mockResolvedValue({ enabled: true } as any);
      queueRepo.findByChannelIdAndMessageId.mockResolvedValue(null);
    });

    it('should log INFO when latency is less than 10 seconds', async () => {
      // Arrange: Message ingested 5 seconds ago
      const now = Date.now();
      const ingestedAt = new Date(now - 5000); // 5 seconds ago

      filteredNewsService.getMatchingMessages.mockResolvedValue([
        {
          channelId: '-100123456789',
          messageId: 42,
          content: 'Test content',
          publishedAt: now,
          ingestedAt: ingestedAt.toISOString(),
          media: [],
          matchedKeywords: ['test'],
        },
      ] as any);

      enqueueUseCase.execute.mockResolvedValue({ id: 'queue-1' } as any);

      // Act
      await handler.handle(mockRawMessage);

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /✅ Latency \d+\.\d+s for -100123456789:42 \(target <10s met\)/,
        ),
      );
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('target <10s MISSED'),
      );
    });

    it('should log WARN when latency is 10 seconds or more', async () => {
      // Arrange: Message ingested 15 seconds ago
      const now = Date.now();
      const ingestedAt = new Date(now - 15000); // 15 seconds ago

      filteredNewsService.getMatchingMessages.mockResolvedValue([
        {
          channelId: '-100123456789',
          messageId: 42,
          content: 'Test content',
          publishedAt: now,
          ingestedAt: ingestedAt.toISOString(),
          media: [],
          matchedKeywords: ['test'],
        },
      ] as any);

      enqueueUseCase.execute.mockResolvedValue({ id: 'queue-1' } as any);

      // Act
      await handler.handle(mockRawMessage);

      // Assert
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /⚠️ Latency \d+\.\d+s for -100123456789:42 \(target <10s MISSED\)/,
        ),
      );
      expect(loggerSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('target <10s met'),
      );
    });

    it('should handle invalid ingestedAt timestamp', async () => {
      // Arrange: Invalid date
      filteredNewsService.getMatchingMessages.mockResolvedValue([
        {
          channelId: '-100123456789',
          messageId: 42,
          content: 'Test content',
          publishedAt: Date.now(),
          ingestedAt: 'invalid-date', // Invalid timestamp
          media: [],
          matchedKeywords: ['test'],
        },
      ] as any);

      enqueueUseCase.execute.mockResolvedValue({ id: 'queue-1' } as any);

      // Act
      await handler.handle(mockRawMessage);

      // Assert
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(
          /Invalid ingestedAt for -100123456789:42.*skipping latency log/,
        ),
      );
    });

    it('should include channelId and messageId in latency logs', async () => {
      // Arrange
      const now = Date.now();
      const ingestedAt = new Date(now - 3000);

      filteredNewsService.getMatchingMessages.mockResolvedValue([
        {
          channelId: '-100987654321',
          messageId: 999,
          content: 'Test content',
          publishedAt: now,
          ingestedAt: ingestedAt.toISOString(),
          media: [],
          matchedKeywords: ['test'],
        },
      ] as any);

      enqueueUseCase.execute.mockResolvedValue({ id: 'queue-1' } as any);

      // Act
      await handler.handle({
        ...mockRawMessage,
        peerId: '-100987654321',
        messageId: 999,
      });

      // Assert
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('for -100987654321:999'),
      );
    });

    it('should calculate latency correctly at 10 second boundary', async () => {
      // Arrange: Exactly 10 seconds ago
      const now = Date.now();
      const ingestedAt = new Date(now - 10000);

      filteredNewsService.getMatchingMessages.mockResolvedValue([
        {
          channelId: '-100123456789',
          messageId: 42,
          content: 'Test content',
          publishedAt: now,
          ingestedAt: ingestedAt.toISOString(),
          media: [],
          matchedKeywords: ['test'],
        },
      ] as any);

      enqueueUseCase.execute.mockResolvedValue({ id: 'queue-1' } as any);

      // Act
      await handler.handle(mockRawMessage);

      // Assert: 10s should trigger WARN (>=10s)
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/⚠️ Latency \d+\.\d+s.*MISSED/),
      );
    });

    it('should not log latency when message is not enqueued', async () => {
      // Arrange: No matching messages
      filteredNewsService.getMatchingMessages.mockResolvedValue([]);

      // Act
      await handler.handle(mockRawMessage);

      // Assert
      expect(loggerSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Latency'),
      );
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Latency'),
      );
    });
  });
});
