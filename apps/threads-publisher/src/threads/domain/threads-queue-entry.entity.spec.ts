import { ThreadsQueueEntry } from './threads-queue-entry.entity';

describe('ThreadsQueueEntry', () => {
  it('creates PENDING entries with raw content of any length', () => {
    const entry = ThreadsQueueEntry.create({
      channelId: '-1001',
      messageId: 42,
      rawContent: 'x'.repeat(600),
    });
    expect(entry.status).toBe('PENDING');
    expect(entry.rawContent).toHaveLength(600);
  });

  it('walks the 6-state lifecycle', () => {
    const entry = ThreadsQueueEntry.create({
      channelId: '-1001',
      messageId: 1,
      rawContent: 'hello',
    });
    entry.transitionTo('PUBLISHING');
    entry.transitionTo('PUBLISHED');
    expect(entry.status).toBe('PUBLISHED');
  });

  it('rejects invalid transitions', () => {
    const entry = ThreadsQueueEntry.create({
      channelId: '-1001',
      messageId: 2,
      rawContent: 'hello',
    });
    expect(() => entry.transitionTo('PUBLISHED')).toThrow(
      'invalid threads transition',
    );
  });

  it('releases PUBLISHING back to PENDING on retry', () => {
    const entry = ThreadsQueueEntry.create({
      channelId: '-1001',
      messageId: 3,
      rawContent: 'hello',
    });
    entry.transitionTo('PUBLISHING');
    entry.transitionTo('PENDING');
    expect(entry.status).toBe('PENDING');
  });
});
