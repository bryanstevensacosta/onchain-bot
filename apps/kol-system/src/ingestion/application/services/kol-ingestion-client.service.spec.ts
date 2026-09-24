import { KolIngestionClientService } from './kol-ingestion-client.service';

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

  it('pollOnce forwards only kol frames to the handler', async () => {
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
    await service.pollOnce();
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
});
