import { KolIngestionClientService } from './kol-ingestion-client.service';
import { ProcessKolMessageHandler } from '../handlers/process-kol-message.handler';

function makeService(): KolIngestionClientService {
  return new KolIngestionClientService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { get: () => undefined } as any,
    {
      listKolSources: async () => [],
      fetchRecentKolMessages: async () => [],
    },
  );
}

describe('KolIngestionClientService', () => {
  it('computes backoff 1s doubling capped at 30s', () => {
    const service = makeService();
    expect(service.buildBackoffDelay(1)).toBe(1000);
    expect(service.buildBackoffDelay(2)).toBe(2000);
    expect(service.buildBackoffDelay(3)).toBe(4000);
    expect(service.buildBackoffDelay(10)).toBe(30000);
    service.stop();
  });

  it('catchUpAfterReconnect forwards only kol rows to the handler', async () => {
    const handled: unknown[] = [];
    const service = new KolIngestionClientService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { get: () => undefined } as any,
      {
        listKolSources: async () => [],
        fetchRecentKolMessages: async () => [
          {
            channelId: '-1001',
            messageId: 1,
            text: 'kol tip',
            occurredAt: '2026-09-24T00:00:00.000Z',
            messageType: 'kol',
          },
          {
            channelId: '-1001',
            messageId: 2,
            text: 'other type',
            occurredAt: '2026-09-24T00:00:00.000Z',
            messageType: 'digest',
          },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { handle: (frame: unknown) => (handled.push(frame), true) } as any,
    );
    await service.catchUpAfterReconnect();
    expect(handled).toHaveLength(1);
    service.stop();
  });

  it('accepts a realtime kol frame and drops frames without a kol marker', () => {
    const service = makeService();
    expect(
      service.acceptRealtimeFrame({
        type: 'message:telegram',
        data: { peerId: '-1001', messageId: 5, messageType: 'kol' },
      }),
    ).toBe(true);
    expect(
      service.acceptRealtimeFrame({
        type: 'message:telegram',
        data: { peerId: '-1001', messageId: 6, messageType: 'digest' },
      }),
    ).toBe(false);
    expect(service.acceptRealtimeFrame({ type: 'health:ping' })).toBe(false);
    service.stop();
  });

  it('is SSE-only: start() schedules NO periodic polling (P20)', async () => {
    jest.useFakeTimers();
    const realFetch = (global as { fetch?: unknown }).fetch;
    (global as { fetch?: unknown }).fetch = jest
      .fn()
      .mockRejectedValue(new Error('no net'));
    try {
      const fetchRecentKolMessages = jest.fn(async () => []);
      const service = new KolIngestionClientService(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { get: () => undefined } as any,
        {
          listKolSources: async () => [],
          fetchRecentKolMessages,
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
      // At most the one boot catch-up read; advancing the clock must
      // schedule NOTHING further (no setInterval polling loop).
      const callsAfterStart = fetchRecentKolMessages.mock.calls.length;
      expect(callsAfterStart).toBeLessThanOrEqual(1);
      jest.advanceTimersByTime(120_000);
      await Promise.resolve();
      expect(fetchRecentKolMessages.mock.calls.length).toBe(callsAfterStart);
      service.stop();
    } finally {
      (global as { fetch?: unknown }).fetch = realFetch;
      jest.useRealTimers();
    }
  });

  it('catches up after reconnect by cursor (only rows newer than last seen)', async () => {
    const occurredAt = '2026-09-24T00:00:00.000Z';
    const rows = [
      {
        channelId: '-1001',
        messageId: 5,
        text: 'dup',
        occurredAt,
        messageType: 'kol',
      },
      {
        channelId: '-1001',
        messageId: 6,
        text: 'new tip',
        occurredAt,
        messageType: 'kol',
      },
      {
        channelId: '-1001',
        messageId: 7,
        text: 'news',
        occurredAt,
        messageType: 'crypto-news',
      },
    ];
    const fetchRecentKolMessages = jest.fn(async () => rows);
    const handler = new ProcessKolMessageHandler();
    const service = new KolIngestionClientService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { get: () => undefined } as any,
      {
        listKolSources: async () => [],
        fetchRecentKolMessages,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      handler,
    );
    expect(
      service.acceptRealtimeFrame({
        type: 'message:telegram',
        data: { peerId: '-1001', messageId: 5, messageType: 'kol' },
      }),
    ).toBe(true);
    expect(service.getLastSeenMessageId('-1001')).toBe(5);
    const accepted = await service.catchUpAfterReconnect();
    expect(fetchRecentKolMessages).toHaveBeenCalledTimes(1);
    expect(accepted).toBe(1);
    expect(handler.processed).toHaveLength(2);
    expect(service.getLastSeenMessageId('-1001')).toBe(6);
    service.stop();
  });
});
