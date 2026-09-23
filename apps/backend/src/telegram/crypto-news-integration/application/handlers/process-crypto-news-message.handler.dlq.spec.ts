import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ProcessCryptoNewsMessageHandler } from './process-crypto-news-message.handler';
import { FilteredCryptoNewsService } from '../services/filtered-crypto-news.service';
import { EnqueueMatchingMessageUseCase } from '../../../crypto-news-publisher/application/handlers/enqueue-matching-message.use-case';
import { MatchingConfigRepository } from '../ports/matching-config.repository';
import { PublisherQueueRepository } from '../../../crypto-news-publisher/application/ports/publisher-queue.repository';
import { DeadLetterService } from '../services/dead-letter.service';
import type { TelegramRawMessage } from 'telegram/ingestion/shared/domain/ports/telegram-listener.port';

describe('ProcessCryptoNewsMessageHandler - DeadLetter wiring', () => {
  let handler: ProcessCryptoNewsMessageHandler;
  let matchingConfigRepo: jest.Mocked<MatchingConfigRepository>;
  let deadLetters: jest.Mocked<DeadLetterService>;

  const raw: TelegramRawMessage = {
    peerId: '-100123456789',
    messageId: 42,
    text: 'Test message',
    occurredAt: new Date(),
    messageType: 'crypto-news',
    senderId: 'test-sender',
    date: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessCryptoNewsMessageHandler,
        {
          provide: FilteredCryptoNewsService,
          useValue: { getMatchingMessages: jest.fn() },
        },
        {
          provide: EnqueueMatchingMessageUseCase,
          useValue: { execute: jest.fn() },
        },
        {
          provide: MatchingConfigRepository,
          useValue: { load: jest.fn() },
        },
        {
          provide: PublisherQueueRepository,
          useValue: { findByChannelIdAndMessageId: jest.fn() },
        },
        {
          provide: DeadLetterService,
          useValue: { capture: jest.fn() },
        },
      ],
    }).compile();

    handler = module.get<ProcessCryptoNewsMessageHandler>(
      ProcessCryptoNewsMessageHandler,
    );
    matchingConfigRepo = module.get(MatchingConfigRepository);
    deadLetters = module.get(DeadLetterService);
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('captures failed messages to the DLQ without throwing', async () => {
    matchingConfigRepo.load.mockRejectedValueOnce(new Error('db down'));

    await expect(handler.handle(raw)).resolves.toBeUndefined();
    expect(deadLetters.capture).toHaveBeenCalledTimes(1);
    expect(deadLetters.capture).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: '-100123456789',
        messageId: 42,
        failureReason: 'db down',
      }),
    );
  });

  it('leaves the SSE stream unaffected when capture itself throws', async () => {
    matchingConfigRepo.load.mockRejectedValueOnce(new Error('db down'));
    deadLetters.capture.mockRejectedValueOnce(new Error('dlq down'));

    await expect(handler.handle(raw)).resolves.toBeUndefined();
  });

  it('works without a DLQ provider (optional injection)', async () => {
    const bare: TestingModule = await Test.createTestingModule({
      providers: [
        ProcessCryptoNewsMessageHandler,
        {
          provide: FilteredCryptoNewsService,
          useValue: { getMatchingMessages: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: EnqueueMatchingMessageUseCase,
          useValue: { execute: jest.fn() },
        },
        {
          provide: MatchingConfigRepository,
          useValue: { load: jest.fn().mockRejectedValue(new Error('x')) },
        },
        {
          provide: PublisherQueueRepository,
          useValue: {
            findByChannelIdAndMessageId: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    const bareHandler = bare.get<ProcessCryptoNewsMessageHandler>(
      ProcessCryptoNewsMessageHandler,
    );
    await expect(bareHandler.handle(raw)).resolves.toBeUndefined();
  });
});
