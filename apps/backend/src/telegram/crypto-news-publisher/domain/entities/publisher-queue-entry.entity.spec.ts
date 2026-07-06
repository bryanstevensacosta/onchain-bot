import { ArticlePublishedEvent } from 'telegram/crypto-news-publisher/domain/events/article-published.event';
import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';

describe('PublisherQueueEntry', () => {
  const baseInput = {
    channelId: '1234567890',
    messageId: 42,
    rawContent: 'some content',
    rawTitle: 'A title',
    imagePath: '/uploads/crypto-news/media/123/42_0.jpg',
    groupedId: null,
    messageReceivedAt: new Date('2026-01-01T00:00:00Z'),
  };

  describe('create', () => {
    it('builds a fresh PENDING entry', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      expect(entry.status).toBe('PENDING');
      expect(entry.attempts).toBe(0);
      expect(entry.publishedAt).toBeNull();
      expect(entry.telegramMessageId).toBeNull();
      expect(entry.lastError).toBeNull();
      expect(entry.id).toEqual(expect.any(String));
    });

    it('throws on empty channelId', () => {
      expect(() =>
        PublisherQueueEntry.create({ ...baseInput, channelId: '' }),
      ).toThrow(/channelId/);
    });

    it('throws on negative messageId', () => {
      expect(() =>
        PublisherQueueEntry.create({ ...baseInput, messageId: -1 }),
      ).toThrow(/messageId/);
    });
  });

  describe('markScheduled', () => {
    it('transitions PENDING → SCHEDULED', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      entry.markScheduled(new Date('2026-01-01T00:30:00Z'));
      expect(entry.status).toBe('SCHEDULED');
    });

    it('allows SCHEDULED → SCHEDULED (idempotent re-schedule)', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      entry.markScheduled(new Date('2026-01-01T00:30:00Z'));
      entry.markScheduled(new Date('2026-01-01T00:45:00Z'));
      expect(entry.status).toBe('SCHEDULED');
    });

    it('throws when entry is already PUBLISHED', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      entry.markPublished('telegram-msg-id');
      expect(() =>
        entry.markScheduled(new Date('2026-01-01T00:30:00Z')),
      ).toThrow(/PUBLISHED/);
    });

    it('throws when entry is already FAILED', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      entry.markFailed('boom');
      expect(() =>
        entry.markScheduled(new Date('2026-01-01T00:30:00Z')),
      ).toThrow(/FAILED/);
    });
  });

  describe('markPublished', () => {
    it('transitions PENDING → PUBLISHED + emits event', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      entry.markPublished('telegram-msg-id');

      expect(entry.status).toBe('PUBLISHED');
      expect(entry.telegramMessageId).toBe('telegram-msg-id');
      expect(entry.publishedAt).toBeInstanceOf(Date);
      expect(entry.lastError).toBeNull();

      const events = entry.commit();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(ArticlePublishedEvent);
      const evt = events[0] as ArticlePublishedEvent;
      expect(evt.payload.channelId).toBe(baseInput.channelId);
      expect(evt.payload.messageId).toBe(baseInput.messageId);
      expect(evt.payload.telegramMessageId).toBe('telegram-msg-id');
    });

    it('allows SCHEDULED → PUBLISHED', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      entry.markScheduled(new Date());
      entry.markPublished('msg');
      expect(entry.status).toBe('PUBLISHED');
    });

    it('throws on empty telegramMessageId', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      expect(() => entry.markPublished('')).toThrow(/telegramMessageId/);
    });

    it('throws when entry is already PUBLISHED (no double-publish)', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      entry.markPublished('first');
      expect(() => entry.markPublished('second')).toThrow(/PUBLISHED/);
    });
  });

  describe('markFailed', () => {
    it('transitions PENDING → FAILED + records reason', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      entry.markFailed('LLM timeout');
      expect(entry.status).toBe('FAILED');
      expect(entry.lastError).toBe('LLM timeout');
      expect(entry.publishedAt).toBeInstanceOf(Date);
    });

    it('throws on empty reason', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      expect(() => entry.markFailed('')).toThrow(/reason/);
    });

    it('throws when entry is terminal', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      entry.markPublished('msg');
      expect(() => entry.markFailed('too late')).toThrow(/PUBLISHED/);
    });
  });

  describe('incrementAttempts', () => {
    it('increments from 0 → 1 → 2 on PENDING', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      expect(entry.attempts).toBe(0);
      entry.incrementAttempts();
      expect(entry.attempts).toBe(1);
      entry.incrementAttempts();
      expect(entry.attempts).toBe(2);
    });

    it('works on SCHEDULED too', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      entry.markScheduled(new Date());
      entry.incrementAttempts();
      expect(entry.attempts).toBe(1);
    });

    it('throws once PUBLISHED (terminal)', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      entry.markPublished('msg');
      expect(() => entry.incrementAttempts()).toThrow(/PUBLISHED/);
    });

    it('throws once FAILED (terminal)', () => {
      const entry = PublisherQueueEntry.create(baseInput);
      entry.markFailed('boom');
      expect(() => entry.incrementAttempts()).toThrow(/FAILED/);
    });
  });
});
