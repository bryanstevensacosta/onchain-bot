import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { ExpireStaleQueueEntriesScheduler } from './expire-stale-queue-entries.scheduler';
import { QueueManager } from '../services/queue-manager.service';
import { PublisherQueueEntry } from '../../domain/publisher-queue-entry.entity';
import { InMemoryPublisherQueueRepository } from '../../infrastructure/persistence/in-memory/in-memory-publisher-queue.repository';

function build(ttlHours = 24) {
  const repo = new InMemoryPublisherQueueRepository();
  const config = {
    get: jest.fn((key: string, fallback?: unknown) => {
      if (key === 'QUEUE_MAX_PENDING') {
        return '36';
      }
      if (key === 'QUEUE_TTL_HOURS') {
        return String(ttlHours);
      }
      return fallback;
    }),
  } as unknown as ConfigService;
  const manager = new QueueManager(repo, config);
  const registry = new SchedulerRegistry();
  const scheduler = new ExpireStaleQueueEntriesScheduler(
    manager,
    registry,
    config,
  );
  return { scheduler, manager, repo };
}

describe('ExpireStaleQueueEntriesScheduler', () => {
  it('expires entries older than the TTL and leaves fresh ones', async () => {
    const { scheduler, manager } = build(24);
    const stale = PublisherQueueEntry.create({
      contentType: 'crypto-news',
      channelId: '-1001',
      messageId: 1,
      rawContent: 'old',
      queuedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    });
    await manager.enqueue(stale);
    await manager.enqueue(
      PublisherQueueEntry.create({
        contentType: 'crypto-news',
        channelId: '-1001',
        messageId: 2,
        rawContent: 'fresh',
      }),
    );
    await scheduler.tick();
    const counts = await manager.counts();
    expect(counts.failed).toBe(1);
    expect(counts.pending).toBe(1);
  });

  it('is a no-op on an empty queue', async () => {
    const { scheduler, manager } = build();
    await scheduler.tick();
    const counts = await manager.counts();
    expect(counts.total).toBe(0);
  });
});
