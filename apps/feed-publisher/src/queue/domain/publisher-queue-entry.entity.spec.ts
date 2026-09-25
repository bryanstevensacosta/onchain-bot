import { PublisherQueueEntry } from './publisher-queue-entry.entity';

function makeInput(overrides = {}) {
  return {
    contentType: 'crypto-news',
    channelId: '-1001234',
    messageId: 42,
    rawContent: 'ETF inflows hit record highs',
    ...overrides,
  };
}

describe('PublisherQueueEntry', () => {
  it('creates a PENDING entry with a deterministic id', () => {
    const entry = PublisherQueueEntry.create(makeInput({}));
    expect(entry.status).toBe('PENDING');
    expect(entry.attempts).toBe(0);
    expect(entry.contentType).toBe('crypto-news');
    expect(entry.id).toBe('crypto-news:-1001234:42'.toLowerCase());
    expect(entry.matchedKeywordIds).toEqual([]);
    expect(entry.queuedAt).toBeInstanceOf(Date);
  });

  it('accepts the threads contentType (unified queue discriminator)', () => {
    const entry = PublisherQueueEntry.create(
      makeInput({ contentType: 'threads' }),
    );
    expect(entry.contentType).toBe('threads');
  });

  it('rejects an unsupported contentType', () => {
    expect(() =>
      PublisherQueueEntry.create(makeInput({ contentType: 'sms' })),
    ).toThrow(/Unsupported content type/);
  });

  it('rejects empty channelId, negative messageId and null content', () => {
    expect(() =>
      PublisherQueueEntry.create(makeInput({ channelId: '' })),
    ).toThrow();
    expect(() =>
      PublisherQueueEntry.create(makeInput({ messageId: -1 })),
    ).toThrow();
    expect(() =>
      PublisherQueueEntry.create(makeInput({ rawContent: null })),
    ).toThrow();
  });

  it('walks PENDING -> SCHEDULED -> PUBLISHING -> PUBLISHED', () => {
    const entry = PublisherQueueEntry.create(makeInput({}));
    entry.markScheduled();
    expect(entry.status).toBe('SCHEDULED');
    entry.markPublishing();
    expect(entry.status).toBe('PUBLISHING');
    entry.markPublished('tg-99', { content: 'rendered' });
    expect(entry.status).toBe('PUBLISHED');
    expect(entry.telegramMessageId).toBe('tg-99');
    expect(entry.generatedContent).toBe('rendered');
    expect(entry.publishedAt).toBeInstanceOf(Date);
    expect(entry.isTerminal()).toBe(true);
  });

  it('supports PENDING -> FAILED and PUBLISHING -> FAILED with a reason', () => {
    const entry = PublisherQueueEntry.create(makeInput({}));
    entry.markFailed('LLM returned empty content');
    expect(entry.status).toBe('FAILED');
    expect(entry.lastError).toBe('LLM returned empty content');
    expect(entry.isTerminal()).toBe(true);
  });

  it('supports BLOCKED as a terminal dedup state with duplicate refs', () => {
    const entry = PublisherQueueEntry.create(makeInput({}));
    entry.markBlocked('Duplicate content of queue', {
      channelId: '-1001',
      messageId: 7,
    });
    expect(entry.status).toBe('BLOCKED');
    expect(entry.blockedReason).toBe('Duplicate content of queue');
    expect(entry.duplicateOfChannelId).toBe('-1001');
    expect(entry.duplicateOfMessageId).toBe(7);
    expect(entry.isTerminal()).toBe(true);
  });

  it('releases PUBLISHING back to PENDING for retry without losing attempts', () => {
    const entry = PublisherQueueEntry.create(makeInput({}));
    entry.markScheduled();
    entry.markPublishing();
    entry.incrementAttempts();
    entry.releaseToPending();
    expect(entry.status).toBe('PENDING');
    expect(entry.attempts).toBe(1);
    expect(entry.isTerminal()).toBe(false);
  });

  it('rejects illegal transitions', () => {
    const entry = PublisherQueueEntry.create(makeInput({}));
    entry.markScheduled();
    expect(() => entry.markScheduled()).toThrow(/SCHEDULED to SCHEDULED/);
    expect(() => entry.releaseToPending()).toThrow(/PUBLISHING/);
    entry.markFailed('boom');
    expect(() => entry.markScheduled()).toThrow(/terminal/i);
    expect(() => entry.releaseToPending()).toThrow();
    expect(() => entry.incrementAttempts()).toThrow(/terminal/);
  });
});
