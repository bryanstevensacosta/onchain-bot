import { Test, TestingModule } from '@nestjs/testing';
import {
  CRYPTO_NEWS_DEDUP_SOURCE,
  EnqueueMatchingMessageUseCase,
} from './enqueue-matching-message.use-case';
import { PublisherQueueRepository } from '../ports/publisher-queue.repository';
import {
  EnqueueMessageDto,
  EnqueueMessageMediaDto,
} from '../../domain/dtos/enqueue-message.dto';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';
import { DeduplicationService } from 'shared/deduplication/application/services/deduplication.service';
import { DedupRecord } from 'shared/deduplication/domain/entities/dedup-record.entity';
import { Fingerprint } from 'shared/deduplication/domain/value-objects/fingerprint.vo';

const NOT_DUPLICATE = { isDuplicate: false, zone: 'different' as const };
const NO_URL_OVERLAP = {
  isDuplicate: false,
  zone: 'different' as const,
  urlOverlapCount: 0,
};

const buildRecord = (
  channelId: string,
  messageId: number,
  referencedEntryId: string | null = null,
): DedupRecord =>
  DedupRecord.create({
    fingerprint: Fingerprint.exact(channelId, messageId),
    source: CRYPTO_NEWS_DEDUP_SOURCE,
    channelId,
    messageId,
    referencedEntryId,
  });

describe('EnqueueMatchingMessageUseCase semantic dedup (task-10)', () => {
  let useCase: EnqueueMatchingMessageUseCase;
  let queueRepo: {
    enqueue: jest.Mock;
    findByChannelIdAndMessageId: jest.Mock;
  };
  let dedup: {
    checkExact: jest.Mock;
    checkContent: jest.Mock;
    checkUrl: jest.Mock;
    checkSemantic: jest.Mock;
  };

  const mockMedia: EnqueueMessageMediaDto = {
    index: 0,
    type: 'photo',
    filePath: '/uploads/crypto-news/media/btc.png',
    mimeType: 'image/png',
    fileSize: 102400,
  };

  const mockMessage: EnqueueMessageDto = {
    channelId: 'chan-new',
    messageId: 777,
    content: 'Bitcoin just broke $100k, again with feeling!',
    publishedAt: new Date('2024-01-01T12:00:00Z'),
    ingestedAt: new Date('2024-01-01T12:01:00Z'),
    media: [mockMedia],
    groupedId: null,
    matchedKeywords: [],
  };

  const buildModule = async (withDedup: boolean): Promise<TestingModule> => {
    dedup = {
      checkExact: jest.fn().mockResolvedValue(NOT_DUPLICATE),
      checkContent: jest.fn().mockResolvedValue(NOT_DUPLICATE),
      checkUrl: jest.fn().mockResolvedValue(NO_URL_OVERLAP),
      checkSemantic: jest.fn().mockResolvedValue(NOT_DUPLICATE),
    };
    queueRepo = {
      enqueue: jest.fn().mockResolvedValue(undefined),
      findByChannelIdAndMessageId: jest.fn().mockResolvedValue(null),
    };
    return Test.createTestingModule({
      providers: [
        EnqueueMatchingMessageUseCase,
        { provide: PublisherQueueRepository, useValue: queueRepo },
        ...(withDedup
          ? [{ provide: DeduplicationService, useValue: dedup }]
          : []),
      ],
    }).compile();
  };

  beforeEach(async () => {
    const module = await buildModule(true);
    useCase = module.get<EnqueueMatchingMessageUseCase>(
      EnqueueMatchingMessageUseCase,
    );
  });

  it('semantic duplicate → BLOCKED with duplicate_of_* refs', async () => {
    dedup.checkSemantic.mockResolvedValue({
      isDuplicate: true,
      zone: 'duplicate',
      blockedReason: 'Semantic duplicate of queue',
      existingRecord: buildRecord('chan-orig', 111, 'entry-orig'),
    });

    const result = await useCase.execute({ message: mockMessage });

    expect(result).not.toBeNull();
    expect(result!.status).toBe('BLOCKED');
    expect(result!.blockedReason).toBe('Semantic duplicate of queue');
    expect(result!.duplicateOfChannelId).toBe('chan-orig');
    expect(result!.duplicateOfMessageId).toBe(111);
    expect(result!.duplicateOfEntryId).toBe('entry-orig');
    expect(queueRepo.enqueue).toHaveBeenCalledTimes(1);
    expect(queueRepo.enqueue.mock.calls[0][0].status).toBe('BLOCKED');
    expect(dedup.checkExact).toHaveBeenCalledWith(
      CRYPTO_NEWS_DEDUP_SOURCE,
      'chan-new',
      777,
    );
    expect(dedup.checkSemantic).toHaveBeenCalledWith(
      CRYPTO_NEWS_DEDUP_SOURCE,
      mockMessage.content,
      'chan-new',
      777,
      0,
    );
  });

  it('content duplicate (different coords) → BLOCKED and persisted', async () => {
    dedup.checkContent.mockResolvedValue({
      isDuplicate: true,
      zone: 'duplicate',
      blockedReason: 'Duplicate content of queue',
      existingRecord: buildRecord('chan-other', 222, 'entry-other'),
    });

    const result = await useCase.execute({ message: mockMessage });

    expect(result!.status).toBe('BLOCKED');
    expect(result!.blockedReason).toBe('Duplicate content of queue');
    expect(result!.duplicateOfChannelId).toBe('chan-other');
    expect(result!.duplicateOfMessageId).toBe(222);
    expect(result!.duplicateOfEntryId).toBe('entry-other');
    expect(queueRepo.enqueue).toHaveBeenCalledTimes(1);
    // Semantic stage never runs after a content hit.
    expect(dedup.checkSemantic).not.toHaveBeenCalled();
  });

  it('unique → PENDING and enqueued normally', async () => {
    const result = await useCase.execute({ message: mockMessage });

    expect(result).not.toBeNull();
    expect(result!.status).toBe('PENDING');
    expect(result!.blockedReason).toBeNull();
    expect(result!.duplicateOfChannelId).toBeNull();
    expect(result!.duplicateOfMessageId).toBeNull();
    expect(result!.duplicateOfEntryId).toBeNull();
    expect(queueRepo.enqueue).toHaveBeenCalledTimes(1);
  });

  it('dedup store failure → fail-open PENDING enqueue, never throws', async () => {
    dedup.checkExact.mockRejectedValue(new Error('store down'));

    const result = await useCase.execute({ message: mockMessage });

    expect(result).not.toBeNull();
    expect(result!.status).toBe('PENDING');
    expect(queueRepo.enqueue).toHaveBeenCalledTimes(1);
  });

  it('model-down (semantic fail-open) still BLOCKED exact dupes', async () => {
    dedup.checkExact.mockResolvedValue({
      isDuplicate: true,
      zone: 'duplicate',
      blockedReason: 'Duplicate of queue',
      existingRecord: buildRecord('chan-new', 777, 'entry-old'),
    });
    // Model unavailable: semantic returns different without embedding.
    dedup.checkSemantic.mockResolvedValue(NOT_DUPLICATE);
    // Queue no longer holds those coords (evicted) → BLOCKED row persists.
    queueRepo.findByChannelIdAndMessageId.mockResolvedValue(null);

    const result = await useCase.execute({ message: mockMessage });

    expect(result!.status).toBe('BLOCKED');
    expect(result!.blockedReason).toBe('Duplicate of queue');
    expect(queueRepo.enqueue).toHaveBeenCalledTimes(1);
  });

  it('exact duplicate with coords still tracked in queue → skipped (unique guard)', async () => {
    dedup.checkExact.mockResolvedValue({
      isDuplicate: true,
      zone: 'duplicate',
      blockedReason: 'Duplicate of queue',
      existingRecord: buildRecord('chan-new', 777, 'entry-old'),
    });
    queueRepo.findByChannelIdAndMessageId.mockResolvedValue(
      PublisherQueueEntry.create({
        channelId: 'chan-new',
        messageId: 777,
        rawContent: mockMessage.content,
        rawTitle: null,
        imagePaths: [],
        groupedId: null,
        messageReceivedAt: new Date(),
      }),
    );

    const result = await useCase.execute({ message: mockMessage });

    expect(result).toBeNull();
    expect(queueRepo.enqueue).not.toHaveBeenCalled();
  });

  it('no dedup provider wired → PENDING enqueue (pre-wiring behavior)', async () => {
    const module = await buildModule(false);
    const plain = module.get<EnqueueMatchingMessageUseCase>(
      EnqueueMatchingMessageUseCase,
    );
    const plainRepo = module.get<{
      enqueue: jest.Mock;
    }>(PublisherQueueRepository);

    const result = await plain.execute({ message: mockMessage });

    expect(result!.status).toBe('PENDING');
    expect(plainRepo.enqueue).toHaveBeenCalledTimes(1);
  });
});

describe('PublisherQueueEntry.markBlocked (task-10)', () => {
  const buildPending = (): PublisherQueueEntry =>
    PublisherQueueEntry.create({
      channelId: 'chan',
      messageId: 1,
      rawContent: 'content',
      rawTitle: null,
      imagePaths: [],
      groupedId: null,
      messageReceivedAt: new Date(),
    });

  it('PENDING → BLOCKED records reason and refs', () => {
    const entry = buildPending();

    entry.markBlocked('Semantic duplicate of queue', {
      channelId: 'chan-orig',
      messageId: 111,
      entryId: 'entry-orig',
    });

    expect(entry.status).toBe('BLOCKED');
    expect(entry.blockedReason).toBe('Semantic duplicate of queue');
    expect(entry.duplicateOfChannelId).toBe('chan-orig');
    expect(entry.duplicateOfMessageId).toBe(111);
    expect(entry.duplicateOfEntryId).toBe('entry-orig');
    expect(entry.isTerminal).toBe(true);
  });

  it('BLOCKED is terminal — further transitions throw (state guard)', () => {
    const entry = buildPending();
    entry.markBlocked('Duplicate of queue');

    expect(() => entry.markPublished('tg-1')).toThrow();
    expect(() => entry.markFailed('x')).toThrow();
    expect(() => entry.markBlocked('y')).toThrow();
  });

  it('empty reason throws', () => {
    expect(() => buildPending().markBlocked('   ')).toThrow();
  });
});
