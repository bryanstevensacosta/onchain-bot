import { isBlockingFailureReason } from 'shared/deduplication/domain/constants/blocking-failure-reasons';
import { ThreadsKeyword } from 'threads/publisher/domain/entities/threads-keyword.entity';
import { InMemoryThreadsQueueRepository } from 'threads/publisher/application/repositories/in-memory-threads-queue.repository';
import {
  EnqueueThreadsMessageUseCase,
  type EnqueueThreadsMessageDto,
} from './enqueue-threads-message.use-case';

const message = (
  overrides: Partial<EnqueueThreadsMessageDto> = {},
): EnqueueThreadsMessageDto => ({
  channelId: '-100123',
  messageId: 456,
  content: 'bitcoin ETF inflows hit record',
  publishedAt: new Date('2026-09-01T12:00:00Z'),
  ingestedAt: new Date('2026-09-01T12:01:00Z'),
  media: [],
  groupedId: null,
  matchedKeywords: [],
  ...overrides,
});

describe('EnqueueThreadsMessageUseCase', () => {
  let queueRepo: InMemoryThreadsQueueRepository;
  let useCase: EnqueueThreadsMessageUseCase;

  beforeEach(() => {
    queueRepo = new InMemoryThreadsQueueRepository();
    useCase = new EnqueueThreadsMessageUseCase(queueRepo);
  });

  it('enqueues a fresh message as PENDING with raw content intact', async () => {
    const entry = await useCase.execute({ message: message() });

    expect(entry).not.toBeNull();
    expect(entry!.status).toBe('PENDING');
    expect(entry!.channelId).toBe('-100123');
    expect(entry!.messageId).toBe(456);
    expect(entry!.rawContent).toBe('bitcoin ETF inflows hit record');
    expect(await queueRepo.countPending()).toBe(1);
  });

  it('is idempotent: same channel+message twice → 1 row', async () => {
    const first = await useCase.execute({ message: message() });
    const second = await useCase.execute({ message: message() });

    expect(second!.id).toBe(first!.id);
    expect(await queueRepo.countPending()).toBe(1);
    expect(await queueRepo.findAllForDisplay(10)).toHaveLength(1);
  });

  it('skips re-enqueue when the existing entry FAILED with a blocking reason', async () => {
    const first = await useCase.execute({ message: message() });
    await queueRepo.markFailed(first!.id, 'Blacklist match: giveaway');
    expect(isBlockingFailureReason('Blacklist match: giveaway')).toBe(true);

    const second = await useCase.execute({ message: message() });

    expect(second!.id).toBe(first!.id);
    expect(await queueRepo.findAllForDisplay(10)).toHaveLength(1);
  });

  it('re-enqueues when the existing entry FAILED with a transient reason', async () => {
    const first = await useCase.execute({ message: message() });
    await queueRepo.markFailed(
      first!.id,
      'Expired: exceeded 24h in queue without publishing',
    );

    const second = await useCase.execute({ message: message() });

    expect(second!.id).not.toBe(first!.id);
    expect(second!.status).toBe('PENDING');
    expect(await queueRepo.findAllForDisplay(10)).toHaveLength(1);
  });

  it('caps the queue at THREADS_MAX_QUEUE_DEPTH = 100 (oldest evicted)', async () => {
    for (let i = 0; i < 101; i++) {
      await useCase.execute({
        message: message({ messageId: 1000 + i }),
      });
    }

    expect(EnqueueThreadsMessageUseCase.THREADS_MAX_QUEUE_DEPTH).toBe(100);
    const all = await queueRepo.findAllForDisplay(200);
    expect(all).toHaveLength(100);
    // Oldest (messageId 1000) was evicted; newest (1100) kept.
    expect(
      await queueRepo.findByChannelIdAndMessageId('-100123', 1000),
    ).toBeNull();
    expect(
      await queueRepo.findByChannelIdAndMessageId('-100123', 1100),
    ).not.toBeNull();
  });

  it('enqueues 600-char text fine (NEVER rejects by length)', async () => {
    const long = 'x'.repeat(600);
    const entry = await useCase.execute({
      message: message({ content: long }),
    });

    expect(entry).not.toBeNull();
    expect(entry!.rawContent).toHaveLength(600);
    expect(entry!.status).toBe('PENDING');
  });

  it('throws on missing channelId without touching the repo', async () => {
    await expect(
      useCase.execute({ message: message({ channelId: '   ' }) }),
    ).rejects.toThrow('EnqueueThreadsMessageUseCase: missing channelId');
    expect(await queueRepo.countPending()).toBe(0);
  });

  it('returns null when the matched keyword requires media but none is photo', async () => {
    const keyword = ThreadsKeyword.create({
      phrase: 'btc',
      requireMedia: true,
    });
    const result = await useCase.execute({
      message: message({
        media: [{ index: 0, type: 'document', filePath: '/doc.pdf' }],
        matchedKeywords: [keyword],
      }),
    });

    expect(result).toBeNull();
    expect(await queueRepo.countPending()).toBe(0);
  });

  it('freezes the matched keyword templateId onto the entry', async () => {
    const keyword = ThreadsKeyword.create({
      phrase: 'btc',
      templateId: 'tpl-1',
    });
    const entry = await useCase.execute({
      message: message({ matchedKeywords: [keyword] }),
    });

    expect(entry!.keywordTemplateId).toBe('tpl-1');
    expect(entry!.matchedKeywordIds).toEqual([keyword.id]);
  });
});
