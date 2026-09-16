import {
  ThreadsQueueEntry,
  type ThreadsQueueEntryProps,
} from 'threads/publisher/domain/entities/threads-queue-entry.entity';
import { InMemoryThreadsQueueRepository } from 'threads/publisher/application/repositories/in-memory-threads-queue.repository';
import { ExpireStaleThreadsScheduler } from './expire-stale-threads.scheduler';

const HOUR_MS = 60 * 60 * 1000;

const staleProps = (queuedAt: Date): ThreadsQueueEntryProps => ({
  id: crypto.randomUUID(),
  traceId: crypto.randomUUID(),
  channelId: '-100123',
  messageId: 456,
  rawContent: 'old news',
  rawTitle: null,
  imagePath: null,
  imagePaths: [],
  groupedId: null,
  messageReceivedAt: new Date(queuedAt.getTime() - HOUR_MS),
  queuedAt,
  matchedKeywordIds: [],
  keywordTemplateId: null,
  formattingEntities: null,
  status: 'PENDING',
  publishedAt: null,
  telegramMessageId: null,
  lastError: null,
  attempts: 0,
  generatedContent: null,
  generatedSystemPrompt: null,
  generatedUserPrompt: null,
  generatedTemperature: null,
  generatedReasoningEffort: null,
  generatedModel: null,
  blockedReason: null,
  duplicateOfChannelId: null,
  duplicateOfMessageId: null,
  duplicateOfEntryId: null,
});

describe('ExpireStaleThreadsScheduler', () => {
  it('marks PENDING entries older than 24h as FAILED with an Expired reason', async () => {
    const queueRepo = new InMemoryThreadsQueueRepository();
    const stale = ThreadsQueueEntry.reconstitute(
      staleProps(new Date(Date.now() - 25 * HOUR_MS)),
    );
    await queueRepo.enqueue(stale);
    const scheduler = new ExpireStaleThreadsScheduler(queueRepo);

    await scheduler.tick();

    const after = await queueRepo.findById(stale.id);
    expect(after!.status).toBe('FAILED');
    expect(after!.lastError).toContain('Expired');
  });

  it('leaves fresh PENDING entries alone', async () => {
    const queueRepo = new InMemoryThreadsQueueRepository();
    const fresh = ThreadsQueueEntry.reconstitute(
      staleProps(new Date(Date.now() - 1 * HOUR_MS)),
    );
    await queueRepo.enqueue(fresh);
    const scheduler = new ExpireStaleThreadsScheduler(queueRepo);

    await scheduler.tick();

    const after = await queueRepo.findById(fresh.id);
    expect(after!.status).toBe('PENDING');
  });
});
