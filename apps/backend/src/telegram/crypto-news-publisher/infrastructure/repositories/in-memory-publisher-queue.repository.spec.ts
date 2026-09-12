import { InMemoryPublisherQueueRepository } from './in-memory-publisher-queue.repository';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';

describe('InMemoryPublisherQueueRepository', () => {
  const makeEntry = (
    channelId: string,
    messageId: number,
  ): PublisherQueueEntry =>
    PublisherQueueEntry.create({
      channelId,
      messageId,
      rawContent: 'body',
      rawTitle: null,
      imagePath: null,
      groupedId: null,
      messageReceivedAt: new Date(),
    });

  it('countPending reflects live PENDING counts', async () => {
    const repo = new InMemoryPublisherQueueRepository();

    expect(await repo.countPending()).toBe(0);

    const pending = makeEntry('-1001', 1);
    const toPublish = makeEntry('-1001', 2);
    const toFail = makeEntry('-1001', 3);
    await repo.enqueue(pending);
    await repo.enqueue(toPublish);
    await repo.enqueue(toFail);
    expect(await repo.countPending()).toBe(3);

    await repo.markPublished(toPublish.id, 'tg-1');
    expect(await repo.countPending()).toBe(2);

    await repo.markFailed(toFail.id, 'boom');
    expect(await repo.countPending()).toBe(1);

    // Deleting the last PENDING entry drains the count to zero.
    await repo.delete(pending.id);
    expect(await repo.countPending()).toBe(0);
  });

  it('findNextPending returns the oldest PENDING entry', async () => {
    const repo = new InMemoryPublisherQueueRepository();
    const older = PublisherQueueEntry.create({
      channelId: '-1001',
      messageId: 1,
      rawContent: 'old',
      rawTitle: null,
      imagePath: null,
      groupedId: null,
      messageReceivedAt: new Date('2026-09-11T00:00:00.000Z'),
    });
    const newer = PublisherQueueEntry.create({
      channelId: '-1001',
      messageId: 2,
      rawContent: 'new',
      rawTitle: null,
      imagePath: null,
      groupedId: null,
      messageReceivedAt: new Date('2026-09-12T00:00:00.000Z'),
    });
    await repo.enqueue(newer);
    await repo.enqueue(older);

    const next = await repo.findNextPending();

    expect(next?.id).toBe(older.id);
  });

  it('countPublishedToday counts only PUBLISHED entries in the window', async () => {
    const repo = new InMemoryPublisherQueueRepository();
    const entry = makeEntry('-1001', 1);
    await repo.enqueue(entry);
    await repo.markPublished(entry.id, 'tg-1');

    expect(await repo.countPublishedToday(4)).toBe(1);
    expect(await repo.countPending()).toBe(0);
  });
});
