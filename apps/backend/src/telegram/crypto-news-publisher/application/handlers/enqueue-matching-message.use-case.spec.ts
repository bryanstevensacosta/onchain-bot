import { Test, TestingModule } from '@nestjs/testing';
import { EnqueueMatchingMessageUseCase } from './enqueue-matching-message.use-case';
import { PublisherQueueRepository } from '../ports/publisher-queue.repository';
import {
  EnqueueMessageDto,
  EnqueueMessageMediaDto,
} from '../../domain/dtos/enqueue-message.dto';
import { Keyword } from '../../domain/entities/keyword.entity';

describe('EnqueueMatchingMessageUseCase', () => {
  let useCase: EnqueueMatchingMessageUseCase;
  let queueRepo: jest.Mocked<PublisherQueueRepository>;

  const mockMedia: EnqueueMessageMediaDto = {
    index: 0,
    type: 'photo',
    filePath: '/uploads/crypto-news/media/btc.png',
    mimeType: 'image/png',
    fileSize: 102400,
  };

  const mockMessage: EnqueueMessageDto = {
    channelId: 'crypto-news',
    messageId: 456,
    content: 'Bitcoin just broke $100k!',
    publishedAt: new Date('2024-01-01T12:00:00Z'),
    ingestedAt: new Date('2024-01-01T12:01:00Z'),
    media: [mockMedia],
    matchedKeywords: [],
  };

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
      ],
    }).compile();

    useCase = module.get<EnqueueMatchingMessageUseCase>(
      EnqueueMatchingMessageUseCase,
    );
    queueRepo = module.get(PublisherQueueRepository);
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
      expect(callArg.rawTitle).toBeNull();
      expect(callArg.imagePath).toBe('/uploads/crypto-news/media/btc.png');
      expect(callArg.imagePaths).toEqual([
        '/uploads/crypto-news/media/btc.png',
      ]);
      expect(callArg.groupedId).toBeNull();
      expect(callArg.status).toBe('PENDING');
    });

    it('should extract all imagePaths from media array', async () => {
      const multiMediaMessage: EnqueueMessageDto = {
        ...mockMessage,
        media: [
          { index: 0, type: 'photo', filePath: '/first.png' },
          { index: 1, type: 'photo', filePath: '/second.png' },
        ],
      };
      queueRepo.enqueue.mockResolvedValue();

      await useCase.execute({ message: multiMediaMessage });

      const callArg = queueRepo.enqueue.mock.calls[0][0];
      expect(callArg.imagePath).toBe('/first.png'); // First for backward compat
      expect(callArg.imagePaths).toEqual(['/first.png', '/second.png']);
    });

    it('should set imagePath and imagePaths to null/empty when no media', async () => {
      const noMediaMessage: EnqueueMessageDto = {
        ...mockMessage,
        media: [],
      };
      queueRepo.enqueue.mockResolvedValue();

      await useCase.execute({ message: noMediaMessage });

      const callArg = queueRepo.enqueue.mock.calls[0][0];
      expect(callArg.imagePath).toBeNull();
      expect(callArg.imagePaths).toEqual([]);
    });

    it('should throw when channelId is empty', async () => {
      const emptyChannelMessage: EnqueueMessageDto = {
        ...mockMessage,
        channelId: '',
      };

      await expect(
        useCase.execute({ message: emptyChannelMessage }),
      ).rejects.toThrow('EnqueueMatchingMessageUseCase: missing channelId');
      expect(queueRepo.enqueue).not.toHaveBeenCalled();
    });

    it('should throw when channelId is whitespace only', async () => {
      const whitespaceChannelMessage: EnqueueMessageDto = {
        ...mockMessage,
        channelId: '   ',
      };

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

      const messageWithKeywords: EnqueueMessageDto = {
        ...mockMessage,
        matchedKeywords: [matchedKeyword],
      };

      await useCase.execute({ message: messageWithKeywords });

      const callArg = queueRepo.enqueue.mock.calls[0][0];
      expect(callArg.keywordTemplateId).toBe(templateId);
    });

    it('should treat a matched keyword with no templateId as null', async () => {
      const matchedKeyword = Keyword.create({ phrase: 'btc' });
      queueRepo.enqueue.mockResolvedValue();

      const messageWithKeywords: EnqueueMessageDto = {
        ...mockMessage,
        matchedKeywords: [matchedKeyword],
      };

      await useCase.execute({ message: messageWithKeywords });

      const callArg = queueRepo.enqueue.mock.calls[0][0];
      expect(callArg.keywordTemplateId).toBeNull();
    });

    it('should default keywordTemplateId to null when no matched keywords', async () => {
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

    it('should skip enqueue when matched keyword requires media and message has no photo media', async () => {
      const docMediaMessage: EnqueueMessageDto = {
        ...mockMessage,
        media: [{ index: 0, type: 'document', filePath: '/doc.pdf' }],
        matchedKeywords: [
          Keyword.create({
            phrase: 'btc',
            requireMedia: true,
          }),
        ],
      };

      const result = await useCase.execute({ message: docMediaMessage });

      expect(result).toBeNull();
      expect(queueRepo.enqueue).not.toHaveBeenCalled();
    });

    it('should enqueue when matched keyword requires media and message has photo media', async () => {
      queueRepo.enqueue.mockResolvedValue();
      const matchedKeyword = Keyword.create({
        phrase: 'btc',
        requireMedia: true,
      });

      const messageWithKeywords: EnqueueMessageDto = {
        ...mockMessage,
        matchedKeywords: [matchedKeyword],
      };

      const result = await useCase.execute({ message: messageWithKeywords });

      expect(result).not.toBeNull();
      expect(queueRepo.enqueue).toHaveBeenCalledTimes(1);
      const callArg = queueRepo.enqueue.mock.calls[0][0];
      expect(callArg.keywordTemplateId).toBeNull();
    });

    it('should not apply the requireMedia filter when no matched keyword is supplied', async () => {
      const noMediaMessage: EnqueueMessageDto = {
        ...mockMessage,
        media: [],
      };
      queueRepo.enqueue.mockResolvedValue();

      const result = await useCase.execute({ message: noMediaMessage });

      expect(result).not.toBeNull();
      expect(queueRepo.enqueue).toHaveBeenCalledTimes(1);
    });

    it('should enqueue when matched keyword requires media and message has a photo', async () => {
      queueRepo.enqueue.mockResolvedValue();
      const photoMessage: EnqueueMessageDto = {
        ...mockMessage,
        media: [{ index: 0, type: 'photo', filePath: '/uploads/photo.png' }],
        matchedKeywords: [
          Keyword.create({
            phrase: 'btc',
            requireMedia: true,
          }),
        ],
      };

      const result = await useCase.execute({ message: photoMessage });

      expect(result).not.toBeNull();
      expect(queueRepo.enqueue).toHaveBeenCalledTimes(1);
      const callArg = queueRepo.enqueue.mock.calls[0][0];
      expect(callArg.imagePaths).toEqual(['/uploads/photo.png']);
    });

    it('should collect all imagePaths when message has multiple photos', async () => {
      const multiPhotoMessage: EnqueueMessageDto = {
        ...mockMessage,
        media: [
          { index: 0, type: 'photo', filePath: '/uploads/photo1.png' },
          { index: 1, type: 'photo', filePath: '/uploads/photo2.png' },
        ],
      };
      queueRepo.enqueue.mockResolvedValue();

      await useCase.execute({ message: multiPhotoMessage });

      const callArg = queueRepo.enqueue.mock.calls[0][0];
      expect(callArg.imagePaths).toEqual([
        '/uploads/photo1.png',
        '/uploads/photo2.png',
      ]);
    });

    it('should collect all media paths regardless of type', async () => {
      const mixedMediaMessage: EnqueueMessageDto = {
        ...mockMessage,
        media: [
          { index: 0, type: 'photo', filePath: '/uploads/photo.png' },
          { index: 1, type: 'video', filePath: '/uploads/video.mp4' },
          { index: 2, type: 'document', filePath: '/uploads/doc.pdf' },
        ],
      };
      queueRepo.enqueue.mockResolvedValue();

      await useCase.execute({ message: mixedMediaMessage });

      const callArg = queueRepo.enqueue.mock.calls[0][0];
      expect(callArg.imagePaths).toEqual([
        '/uploads/photo.png',
        '/uploads/video.mp4',
        '/uploads/doc.pdf',
      ]);
    });
  });

  describe('MAX_QUEUE_DEPTH', () => {
    it('should equal 36', () => {
      expect(EnqueueMatchingMessageUseCase.MAX_QUEUE_DEPTH).toBe(36);
    });
  });
});
