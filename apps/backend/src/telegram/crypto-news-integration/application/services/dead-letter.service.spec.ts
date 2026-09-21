import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DeadLetterService } from './dead-letter.service';
import { DeadLetterQueueRepository } from '../ports/dead-letter-queue.repository';
import { DeadLetterQueueEntry } from '../../domain/entities/dead-letter-queue-entry.entity';
import { EnqueueMatchingMessageUseCase } from '../../../crypto-news-publisher/application/handlers/enqueue-matching-message.use-case';

describe('DeadLetterService', () => {
  let service: DeadLetterService;
  let repo: jest.Mocked<DeadLetterQueueRepository>;
  let enqueue: jest.Mocked<EnqueueMatchingMessageUseCase>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterService,
        {
          provide: DeadLetterQueueRepository,
          useValue: {
            save: jest.fn(),
            findById: jest.fn(),
            findAll: jest.fn(),
          },
        },
        {
          provide: EnqueueMatchingMessageUseCase,
          useValue: { execute: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<DeadLetterService>(DeadLetterService);
    repo = module.get(DeadLetterQueueRepository);
    enqueue = module.get(EnqueueMatchingMessageUseCase);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('capture', () => {
    it('persists a PENDING entry', async () => {
      await service.capture({
        channelId: '-1001',
        messageId: 42,
        failureReason: 'boom',
        failedPayload: { text: 'hello' },
      });

      expect(repo.save).toHaveBeenCalledTimes(1);
      const saved = repo.save.mock.calls[0][0];
      expect(saved.status).toBe('PENDING');
      expect(saved.channelId).toBe('-1001');
      expect(saved.messageId).toBe(42);
      expect(saved.failureReason).toBe('boom');
      expect(saved.retryCount).toBe(0);
    });

    it('never throws when the repository throws', async () => {
      repo.save.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.capture({
          channelId: '-1001',
          messageId: 7,
          failureReason: 'boom',
        }),
      ).resolves.toBeUndefined();
    });

    it('never throws on invalid input (empty channel)', async () => {
      await expect(
        service.capture({
          channelId: '   ',
          messageId: 7,
          failureReason: 'boom',
        }),
      ).resolves.toBeUndefined();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('returns repository entries', async () => {
      const entry = DeadLetterQueueEntry.create({
        channelId: '-1001',
        messageId: 1,
        failureReason: 'x',
      });
      repo.findAll.mockResolvedValue([entry]);
      await expect(service.list()).resolves.toEqual([entry]);
      expect(repo.findAll).toHaveBeenCalledWith(50);
    });
  });

  describe('retry', () => {
    it('re-enqueues a PENDING entry and marks it RETRIED', async () => {
      const entry = DeadLetterQueueEntry.create({
        channelId: '-1001',
        messageId: 42,
        failureReason: 'boom',
        failedPayload: JSON.stringify({ content: 'retry me' }),
      });
      repo.findById.mockResolvedValue(entry);
      enqueue.execute.mockResolvedValue(null);

      const result = await service.retry(entry.id);

      expect(enqueue.execute).toHaveBeenCalledTimes(1);
      const input = enqueue.execute.mock.calls[0][0];
      expect(input.message.channelId).toBe('-1001');
      expect(input.message.messageId).toBe(42);
      expect(result.status).toBe('RETRIED');
      expect(result.retryCount).toBe(1);
      expect(repo.save).toHaveBeenCalledWith(entry);
    });

    it('throws NotFound (404) for unknown id', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.retry('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(enqueue.execute).not.toHaveBeenCalled();
    });

    it('rejects retry of non-PENDING entries', async () => {
      const entry = DeadLetterQueueEntry.create({
        channelId: '-1001',
        messageId: 42,
        failureReason: 'boom',
      });
      entry.markRetried();
      repo.findById.mockResolvedValue(entry);
      await expect(service.retry(entry.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(enqueue.execute).not.toHaveBeenCalled();
    });
  });
});
