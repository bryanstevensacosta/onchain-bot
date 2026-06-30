import { InMemoryMonitoredCallRepository } from './in-memory-monitored-call.repository';

describe('InMemoryMonitoredCallRepository', () => {
  let repo: InMemoryMonitoredCallRepository;

  beforeEach(() => {
    repo = new InMemoryMonitoredCallRepository();
  });

  function makeCall(callId: string, ageMs: number) {
    return {
      callId,
      chain: 'solana',
      address: callId.toLowerCase(),
      mcAtCall: 1000,
      publishedAt: new Date(Date.now() - ageMs),
      lastEvaluatedAt: null,
    };
  }

  it('saves and finds by callId', async () => {
    const c = makeCall('solana:ABC', 1000);
    await repo.save(c);
    const found = await repo.findByCallId('solana:ABC');
    expect(found).not.toBeNull();
    expect(found?.mcAtCall).toBe(1000);
  });

  it('findByCallId returns null for unknown', async () => {
    const found = await repo.findByCallId('unknown');
    expect(found).toBeNull();
  });

  it('findByChainAndAddress matches chain + address', async () => {
    await repo.save({
      callId: 'solana:ABC',
      chain: 'solana',
      address: 'ABC',
      mcAtCall: 1000,
      publishedAt: new Date(Date.now() - 1000),
      lastEvaluatedAt: null,
    });
    const found = await repo.findByChainAndAddress('solana', 'abc');
    expect(found).not.toBeNull();
    expect(found?.callId).toBe('solana:ABC');
  });

  it('findActive filters by maxAgeMs and respects limit', async () => {
    await repo.save(makeCall('recent', 1000));
    await repo.save(makeCall('old', 1000 * 3600 * 100));
    const active = await repo.findActive(3600 * 1000, 100);
    expect(active.map((c) => c.callId)).toEqual(['recent']);
  });

  it('findActive sorts by publishedAt ascending', async () => {
    await repo.save(makeCall('second', 1000));
    await repo.save(makeCall('first', 100));
    const active = await repo.findActive(3600 * 1000, 100);
    expect(active.map((c) => c.callId)).toEqual(['first', 'second']);
  });

  it('findActive respects limit', async () => {
    await repo.save(makeCall('a', 100));
    await repo.save(makeCall('b', 200));
    await repo.save(makeCall('c', 300));
    const active = await repo.findActive(3600 * 1000, 2);
    expect(active).toHaveLength(2);
  });

  it('updateLastEvaluated mutates the record', async () => {
    const saved = await repo.save(makeCall('c1', 1000));
    expect(saved.id).toBeDefined();
    const at = new Date();
    await repo.updateLastEvaluated(saved.id!, at);
    const found = await repo.findByCallId('c1');
    expect(found?.lastEvaluatedAt).toEqual(at);
  });

  it('deactivate removes the record', async () => {
    const saved = await repo.save(makeCall('c1', 1000));
    await repo.deactivate(saved.id!);
    const found = await repo.findByCallId('c1');
    expect(found).toBeNull();
  });
});
