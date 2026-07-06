import { Test, TestingModule } from '@nestjs/testing';
import { QueueController } from './queue.controller';
import { PublisherQueueRepository } from 'telegram/crypto-news-publisher/application/ports/publisher-queue.repository';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';

describe('QueueController', () => {
  let controller: QueueController;
  let queueRepo: jest.Mocked<PublisherQueueRepository>;

  const makeEntry = (
    status: 'PENDING' | 'PUBLISHED' = 'PENDING',
  ): PublisherQueueEntry => {
    const entry = PublisherQueueEntry.create({
      channelId: 'crypto-news',
      messageId: 1,
      rawContent: 'body',
      rawTitle: 'title',
      imagePath: null,
      groupedId: null,
      messageReceivedAt: new Date(),
    });
    if (status === 'PUBLISHED') {
      entry.markScheduled(new Date());
      entry.markPublished('tg-1');
    }
    return entry;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueueController],
      providers: [
        {
          provide: PublisherQueueRepository,
          useValue: {
            findAllForDisplay: jest.fn(),
            findNextPending: jest.fn(),
            enqueue: jest.fn(),
            markPublished: jest.fn(),
            markFailed: jest.fn(),
            incrementAttempts: jest.fn(),
            countPublishedToday: jest.fn(),
            findById: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<QueueController>(QueueController);
    queueRepo = module.get(PublisherQueueRepository);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('list', () => {
    it('should return entries mapped to views', async () => {
      const entries = [makeEntry(), makeEntry()];
      queueRepo.findAllForDisplay.mockResolvedValue(entries);

      const result = await controller.list();

      expect(result).toHaveLength(2);
      expect(result[0].status).toBe('PENDING');
      expect(queueRepo.findAllForDisplay).toHaveBeenCalledWith(50);
    });

    it('should clamp the limit to a maximum of 500', async () => {
      queueRepo.findAllForDisplay.mockResolvedValue([]);

      await controller.list('99999');

      expect(queueRepo.findAllForDisplay).toHaveBeenCalledWith(500);
    });

    it('should clamp the limit to a minimum of 1', async () => {
      queueRepo.findAllForDisplay.mockResolvedValue([]);

      await controller.list('0');

      expect(queueRepo.findAllForDisplay).toHaveBeenCalledWith(1);
    });

    it('should default to 50 when no limit is given', async () => {
      queueRepo.findAllForDisplay.mockResolvedValue([]);

      await controller.list();

      expect(queueRepo.findAllForDisplay).toHaveBeenCalledWith(50);
    });
  });

  describe('counts', () => {
    it('should return counts with remaining = cap - published', async () => {
      const pendingEntries = [makeEntry(), makeEntry(), makeEntry()];
      queueRepo.findAllForDisplay.mockResolvedValue(pendingEntries);
      queueRepo.countPublishedToday.mockResolvedValue(10);

      const result = await controller.counts();

      expect(result.pending).toBe(3);
      expect(result.publishedToday).toBe(10);
      expect(result.dailyCap).toBe(36);
      expect(result.remainingToday).toBe(26);
    });

    it('should not let remainingToday go below zero', async () => {
      queueRepo.findAllForDisplay.mockResolvedValue([]);
      queueRepo.countPublishedToday.mockResolvedValue(50);

      const result = await controller.counts();

      expect(result.remainingToday).toBe(0);
    });
  });
});
