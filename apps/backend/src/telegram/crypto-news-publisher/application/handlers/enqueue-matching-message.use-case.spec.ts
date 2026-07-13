import { Test, TestingModule } from '@nestjs/testing';
import { EnqueueMatchingMessageUseCase } from './enqueue-matching-message.use-case';
import { PublisherQueueRepository } from '../ports/publisher-queue.repository';
import { CryptoNewsMessageRepository } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-message.repository';
import { CryptoNewsMessage } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-message.entity';
import { Keyword } from '../../domain/entities/keyword.entity';

describe('EnqueueMatchingMessageUseCase', () => {
  let useCase: EnqueueMatchingMessageUseCase;
  let queueRepo: jest.Mocked<PublisherQueueRepository>;
  let messageRepo: jest.Mocked<CryptoNewsMessageRepository>;

  const mockMessage: CryptoNewsMessage = {
    id: 'msg-123',
    channelId: 'crypto-news',
    messageId: 456,
    content: 'Bitcoin just broke $100k!',
    title: 'Bitcoin Hits $100K',
    media: [
      {
        id: 'media-1',
        messageId: 'msg-123',
        filePath: '/uploads/crypto-news/media/btc.png',
        mimeType: 'image/png',
        width: 800,
        height: 600,
      },
    ],
    groupedId: null,
    receivedAt: new Date(),
  } as CryptoNewsMessage;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnqueueMatchingMessageUseCase,
        {
          provide: PublisherQueueRepository,
          useValue: {
            enqueue: jest.fn(),
          },
        },
        {
          provide: CryptoNewsMessageRepository,
          useValue: {
            findByChannelAndGroupedId: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    useCase = module.get<EnqueueMatchingMessageUseCase>(
      EnqueueMatchingMessageUseCase,
    );
    queueRepo = module.get(PublisherQueueRepository);
    messageRepo = module.get(CryptoNewsMessageRepository);
  });

  it('should be defined', () => {
    expect(useCase).toBeDefined();
  });

  describe('execute', () => {
    it('should enqueue a message with all fields populated', async () => {
      queueRepo.enqueue.mockResolvedValue();

      const result = await useCase.execute({ message: mockMessage });
      void result;

      expect(queueRepo.enqueue).toHaveBeenCalledTimes(1);
      const callArg = queueRepo.enqueue.mock.calls[0][0];
      expect(callArg.channelId).toBe('crypto-news');
      expect(callArg.messageId).toBe(456);
      expect(callArg.rawContent).toBe('Bitcoin just broke $100k!');
      expect(callArg.rawTitle).toBe('Bitcoin Hits $100K');
      expect(callArg.imagePath).toBe('/uploads/crypto-news/media/btc.png');
      expect(callArg.groupedId).toBeNull();
      expect(callArg.status).toBe('PENDING');
    });

    it('should extract first imagePath from media array', async () => {
      const multiMediaMessage = {
        ...mockMessage,
        media: [
          { id: 'm1', filePath: '/first.png' },
          { id: 'm2', filePath: '/second.png' },
        ],
      } as unknown as CryptoNewsMessage;
      queueRepo.enqueue.mockResolvedValue();

      await useCase.execute({ message: multiMediaMessage });

      const callArg = queueRepo.enqueue.mock.calls[0][0];
      expect(callArg.imagePath).toBe('/first.png');
    });

    it('should set imagePath to null when no media', async () => {
      const noMediaMessage = {
        ...mockMessage,
        media: [],
      } as unknown as CryptoNewsMessage;
      queueRepo.enqueue.mockResolvedValue();

      await useCase.execute({ message: noMediaMessage });

      const callArg = queueRepo.enqueue.mock.calls[0][0];
      expect(callArg.imagePath).toBeNull();
    });

    it('should throw when channelId is empty', async () => {
      const emptyChannelMessage = {
        ...mockMessage,
        channelId: '',
      } as unknown as CryptoNewsMessage;

      await expect(
        useCase.execute({ message: emptyChannelMessage }),
      ).rejects.toThrow('EnqueueMatchingMessageUseCase: missing channelId');
      expect(queueRepo.enqueue).not.toHaveBeenCalled();
    });

    it('should throw when channelId is whitespace only', async () => {
      const whitespaceChannelMessage = {
        ...mockMessage,
        channelId: '   ',
      } as unknown as CryptoNewsMessage;

      await expect(
        useCase.execute({ message: whitespaceChannelMessage }),
      ).rejects.toThrow('EnqueueMatchingMessageUseCase: missing channelId');
      expect(queueRepo.enqueue).not.toHaveBeenCalled();
    });

    it('should freeze the matched keyword templateId onto the queue entry', async () => {
      const templateId = crypto.randomUUID();
      const matchedKeyword = Keyword.create({
        phrase: 'btc',
        templateId,
      });
      queueRepo.enqueue.mockResolvedValue();

      await useCase.execute({
        message: mockMessage,
        matchedKeywords: [matchedKeyword],
      });

      const callArg = queueRepo.enqueue.mock.calls[0][0];
      expect(callArg.keywordTemplateId).toBe(templateId);
    });

    it('should treat a matched keyword with no templateId as null', async () => {
      const matchedKeyword = Keyword.create({ phrase: 'btc' });
      queueRepo.enqueue.mockResolvedValue();

      await useCase.execute({
        message: mockMessage,
        matchedKeywords: [matchedKeyword],
      });

      const callArg = queueRepo.enqueue.mock.calls[0][0];
      expect(callArg.keywordTemplateId).toBeNull();
    });

    it('should default keywordTemplateId to null when matchedKeyword is omitted', async () => {
      queueRepo.enqueue.mockResolvedValue();

      await useCase.execute({ message: mockMessage });

      const callArg = queueRepo.enqueue.mock.calls[0][0];
      expect(callArg.keywordTemplateId).toBeNull();
    });

    it('should return the enqueued entry for logging', async () => {
      queueRepo.enqueue.mockResolvedValue();

      const result = await useCase.execute({ message: mockMessage });

      // The entry returned should be the one passed to enqueue
      expect(result).toBeDefined();
      expect(result!.channelId).toBe('crypto-news');
    });

    it('should skip enqueue when matched keyword requires image and message has no media', async () => {
      const noMediaMessage = {
        ...mockMessage,
        media: [],
      } as unknown as CryptoNewsMessage;
      const matchedKeyword = Keyword.create({
        phrase: 'btc',
        requireImage: true,
      });

      const result = await useCase.execute({
        message: noMediaMessage,
        matchedKeywords: [matchedKeyword],
      });

      expect(result).toBeNull();
      expect(queueRepo.enqueue).not.toHaveBeenCalled();
    });

    it('should enqueue when matched keyword requires image and message has media', async () => {
      queueRepo.enqueue.mockResolvedValue();
      const matchedKeyword = Keyword.create({
        phrase: 'btc',
        requireImage: true,
      });

      const result = await useCase.execute({
        message: mockMessage,
        matchedKeywords: [matchedKeyword],
      });

      expect(result).not.toBeNull();
      expect(queueRepo.enqueue).toHaveBeenCalledTimes(1);
      const callArg = queueRepo.enqueue.mock.calls[0][0];
      expect(callArg.keywordTemplateId).toBeNull();
    });

    it('should not apply the requireImage filter when no matched keyword is supplied', async () => {
      const noMediaMessage = {
        ...mockMessage,
        media: [],
      } as unknown as CryptoNewsMessage;
      queueRepo.enqueue.mockResolvedValue();

      const result = await useCase.execute({ message: noMediaMessage });

      expect(result).not.toBeNull();
      expect(queueRepo.enqueue).toHaveBeenCalledTimes(1);
    });
  });

  describe('MAX_QUEUE_DEPTH', () => {
    it('should equal 36', () => {
      expect(EnqueueMatchingMessageUseCase.MAX_QUEUE_DEPTH).toBe(36);
    });
  });
});
