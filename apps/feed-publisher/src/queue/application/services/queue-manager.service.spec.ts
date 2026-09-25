import { ConfigService } from '@nestjs/config';
import { QueueManager } from './queue-manager.service';
import { PublisherQueueEntry } from '../../domain/publisher-queue-entry.entity';
import { InMemoryPublisherQueueRepository } from '../../infrastructure/persistence/in-memory/in-memory-publisher-queue.repository';
import { QueueFullError } from 'shared/exceptions/feed-publisher.error';

function makeEntry(channelId: string, messageId: number) {
  return PublisherQueueEntry.create({
    contentType: 'crypto-news',
    channelId,
    messageId,
    rawContent: `content ${channelId}:${messageId}`,
  });
}

function buildManager(maxPending = 2) {
  const repo = new InMemoryPublisherQueueRepository();
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'QUEUE_MAX_PENDING') {
        return String(maxPending);
      }
      return fallback;
    }),
  } as unknown as ConfigService;
  return { manager: new QueueManager(repo, config), repo };
}

describe('QueueManager', () => {
  it('enqueues entries and reports counts', async () => {
    const { manager } = buildManager();
    await manager.enqueue(makeEntry('-1001', 1));
    await manager.enqueue(makeEntry('-1001', 2));
    const counts = await manager.counts();
    expect(counts.pending).toBe(2);
    expect(counts.total).toBe(2);
  });

  it('throws QueueFullError when the pending cap is reached', async () => {
    const { manager } = buildManager(1);
    await manager.enqueue(makeEntry('-1001', 1));
    await expect(manager.enqueue(makeEntry('-1001', 2))).rejects.toBeInstanceOf(
      QueueFullError,
    );
  });

  it('returns the oldest PENDING entry first', async () => {
    const { manager } = buildManager();
    const first = makeEntry('-1001', 1);
    const second = makeEntry('-1001', 2);
    await manager.enqueue(second);
    await manager.enqueue(first);
    const next = await manager.nextPending();
    expect(next?.messageId).toBe(2);
  });

  it('expires stale PENDING entries past the TTL', async () => {
    const { manager, repo } = buildManager();
    const entry = makeEntry('-1001', 1);
    await repo.save(entry);
    const expired = await manager.expireOlderThan(0, 'Expired: ttl');
    expect(expired).toBe(1);
    const reloaded = await repo.findById(entry.id);
    expect(reloaded?.status).toBe('FAILED');
    expect(reloaded?.lastError).toContain('Expired');
  });

  it('does not expire fresh entries', async () => {
    const { manager } = buildManager();
    await manager.enqueue(makeEntry('-1001', 1));
    const expired = await manager.expireOlderThan(24 * 60 * 60 * 1000, 'ttl');
    expect(expired).toBe(0);
  });

  it('removes entries by id', async () => {
    const { manager } = buildManager();
    const entry = makeEntry('-1001', 1);
    await manager.enqueue(entry);
    expect(await manager.remove(entry.id)).toBe(true);
    expect(await manager.remove(entry.id)).toBe(false);
  });
});
