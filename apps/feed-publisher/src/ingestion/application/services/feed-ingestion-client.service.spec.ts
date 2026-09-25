import { FeedIngestionClient } from './feed-ingestion-client.service';

function makeService(): FeedIngestionClient {
  return new FeedIngestionClient(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { get: () => undefined } as any,
    {
      listFeedSources: async () => [],
      fetchRecentFeedMessages: async () => [],
    },
  );
}

describe('FeedIngestionClient', () => {
  it('computes backoff 1s doubling capped at 30s', () => {
    const service = makeService();
    expect(service.buildBackoffDelay(1)).toBe(1000);
    expect(service.buildBackoffDelay(2)).toBe(2000);
    expect(service.buildBackoffDelay(3)).toBe(4000);
    expect(service.buildBackoffDelay(10)).toBe(30000);
    service.stop();
  });

  it('accepts feed frames and rejects the foreign feed type (P10 negative assert)', () => {
    const service = makeService();
    expect(
      service.acceptRealtimeFrame({
        type: 'message:telegram',
        data: { peerId: '-1001', messageId: 5, messageType: 'crypto-news' },
      }),
    ).toBe(true);
    expect(
      service.acceptRealtimeFrame({
        type: 'message:telegram',
        data: { peerId: '-1001', messageId: 6, messageType: 'kol' },
      }),
    ).toBe(false);
    expect(service.acceptRealtimeFrame({ type: 'health:ping' })).toBe(false);
    service.stop();
  });

  it('catches up after reconnect by cursor (only rows newer than last seen)', async () => {
    const occurredAt = '2026-09-25T00:00:00.000Z';
    const rows = [
      {
        channelId: '-1001',
        messageId: 5,
        text: 'seen',
        occurredAt,
        messageType: 'crypto-news',
      },
      {
        channelId: '-1001',
        messageId: 6,
        text: 'fresh',
        occurredAt,
        messageType: 'crypto-news',
      },
    ];
    const handled: unknown[] = [];
    const service = new FeedIngestionClient(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { get: () => undefined } as any,
      {
        listFeedSources: async () => [],
        fetchRecentFeedMessages: async () => rows,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { handle: (frame: unknown) => (handled.push(frame), true) } as any,
    );
    // Seed the cursor past message 5, then catch up: only 6 is forwarded.
    expect(
      service.acceptRealtimeFrame({
        type: 'message:telegram',
        data: {
          peerId: '-1001',
          messageId: 5,
          text: 'seen',
          occurredAt,
          messageType: 'crypto-news',
        },
      }),
    ).toBe(true);
    handled.length = 0;
    await service.catchUpAfterReconnect();
    expect(handled).toHaveLength(1);
    service.stop();
  });

  it('is SSE-only: start() schedules NO periodic polling', async () => {
    jest.useFakeTimers();
    const realFetch = (global as { fetch?: unknown }).fetch;
    (global as { fetch?: unknown }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('no net'));
    try {
      const fetchRecentFeedMessages = jest.fn(async () => []);
      const service = new FeedIngestionClient(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { get: () => undefined } as any,
        {
          listFeedSources: async () => [],
          fetchRecentFeedMessages,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      );
      expect(
        'pollTimer' in (service as unknown as Record<string, unknown>),
      ).toBe(false);
      service.start();
      service.stop();
      await Promise.resolve();
      await Promise.resolve();
      const callsAfterStart = fetchRecentFeedMessages.mock.calls.length;
      expect(callsAfterStart).toBeLessThanOrEqual(1);
      jest.advanceTimersByTime(120_000);
      await Promise.resolve();
      expect(fetchRecentFeedMessages.mock.calls.length).toBe(
        callsAfterStart,
      );
      service.stop();
    } finally {
      (global as { fetch?: unknown }).fetch = realFetch;
      jest.useRealTimers();
    }
  });
});
