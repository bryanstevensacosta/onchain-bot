import {
  ContentPublishFailedEvent,
  ContentPublishedEvent,
  ContentQueuedEvent,
} from './content.events';

describe('content events', () => {
  it('carry exact bus names', () => {
    expect(new ContentQueuedEvent('a', 'crypto-news').eventName).toBe(
      'feed-publisher.queue.queued',
    );
    expect(
      new ContentPublishedEvent('a', 'crypto-news', 1).telegramMessageId,
    ).toBe(1);
    expect(
      new ContentPublishFailedEvent('a', 'threads', 'timeout').reason,
    ).toBe('timeout');
  });
});
