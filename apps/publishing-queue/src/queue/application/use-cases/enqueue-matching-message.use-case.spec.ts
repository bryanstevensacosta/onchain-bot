import { ConfigService } from '@nestjs/config';
import { EnqueueMatchingMessageUseCase } from './enqueue-matching-message.use-case';
import { QueueManager } from '../services/queue-manager.service';
import { DeduplicationService } from '@/deduplication/application/services/deduplication.service';
import { InMemoryPublisherQueueRepository } from '@/queue/infrastructure/persistence/in-memory/in-memory-publisher-queue.repository';
import type { MatchedFeedMessage } from '../ports/matched-message-enqueue.port';

function makeMessage(overrides: Partial<MatchedFeedMessage> = {}) {
  return {
    channelId: '-1001',
    messageId: 10,
    title: null,
    content: 'ETF inflows hit record highs',
    publishedAt: new Date().toISOString(),
    ingestedAt: new Date().toISOString(),
    media: [],
    groupedId: null,
    messageType: 'crypto-news',
    matchedKeywords: [],
    hasMedia: false,
    ...overrides,
  } as MatchedFeedMessage;
}

function build(dedup: Partial<DeduplicationService> = {}) {
  const repo = new InMemoryPublisherQueueRepository();
  const config = {
    get: jest.fn((_key: string, fallback?: unknown) => fallback),
  } as unknown as ConfigService;
  const manager = new QueueManager(repo, config);
  const deduplication = {
    checkDuplicate: jest.fn().mockResolvedValue({
      isDuplicate: false,
      strategy: 'none',
    }),
    markAsSeen: jest.fn().mockResolvedValue(undefined),
    ...dedup,
  } as unknown as DeduplicationService;
  const useCase = new EnqueueMatchingMessageUseCase(manager, deduplication);
  return { useCase, repo, manager, deduplication };
}

describe('EnqueueMatchingMessageUseCase', () => {
  it('enqueues a matched message as PENDING feed', async () => {
    const { useCase, deduplication } = build();
    const entry = await useCase.execute({ message: makeMessage() });
    expect(entry).not.toBeNull();
    expect(entry?.status).toBe('PENDING');
    expect(entry?.contentType).toBe('crypto-news');
    expect(deduplication.markAsSeen).toHaveBeenCalled();
  });

  it('blocks (not drops) semantic duplicates with duplicate refs', async () => {
    const { useCase } = build({
      checkDuplicate: jest.fn().mockResolvedValue({
        isDuplicate: true,
        strategy: 'content',
        blockedReason: 'Duplicate content of queue',
        duplicateOf: { channelId: '-1009', messageId: 3 },
      }),
    });
    const entry = await useCase.execute({ message: makeMessage() });
    expect(entry?.status).toBe('BLOCKED');
    expect(entry?.blockedReason).toBe('Duplicate content of queue');
    expect(entry?.duplicateOfChannelId).toBe('-1009');
  });

  it('returns null when the same channel+message is already tracked', async () => {
    const checkDuplicate = jest
      .fn()
      .mockResolvedValueOnce({ isDuplicate: false, strategy: 'none' })
      .mockResolvedValue({
        isDuplicate: true,
        strategy: 'exact',
        blockedReason: 'Duplicate of queue',
        duplicateOf: { channelId: '-1001', messageId: 10 },
      });
    const { useCase, deduplication } = build({
      checkDuplicate,
    });
    await useCase.execute({ message: makeMessage() });
    const second = await useCase.execute({ message: makeMessage() });
    expect(second).toBeNull();
    expect(deduplication.markAsSeen).toHaveBeenCalledTimes(1);
  });

  it('skips media-gated keywords when only documents are attached', async () => {
    const { useCase } = build();
    const result = await useCase.execute({
      message: makeMessage({
        media: [{ index: 0, type: 'document' }],
        matchedKeywords: [{ requireMedia: true } as never],
      }),
    });
    expect(result).toBeNull();
  });

  it('fail-open: enqueues when the dedup probe throws (embeddings down)', async () => {
    const { useCase } = build({
      checkDuplicate: jest
        .fn()
        .mockRejectedValue(new Error('embeddings unavailable')),
      markAsSeen: jest.fn().mockRejectedValue(new Error('store down')),
    });
    const entry = await useCase.execute({ message: makeMessage() });
    expect(entry?.status).toBe('PENDING');
  });

  it('throws on messages without a channel', async () => {
    const { useCase } = build();
    await expect(
      useCase.execute({ message: makeMessage({ channelId: '' }) }),
    ).rejects.toThrow();
  });
});
