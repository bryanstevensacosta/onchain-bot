import { RecordNotifiedAchievementUseCase } from './record-notified-achievement.use-case';
import { AchievementCachePort } from '../ports/achievement-cache.port';
import { AchievementEventPublisher } from '../ports/achievement-event.publisher';
import { DomainEvent } from 'shared/kernel/domain-event';
import { MonitoredCallRecord } from '../ports/monitored-call.repository';
import { CallAchievementReachedEvent } from '../../domain/events/call-achievement-reached.event';

class FakeCache extends AchievementCachePort {
  public added: Array<{ callId: string; threshold: number }> = [];
  async getNotifiedThresholds(): Promise<Set<number>> {
    return new Set();
  }
  async addNotifiedThreshold(callId: string, threshold: number): Promise<void> {
    this.added.push({ callId, threshold });
  }
  async invalidateCall(): Promise<void> {}
}

class FailingCache extends AchievementCachePort {
  async getNotifiedThresholds(): Promise<Set<number>> {
    return new Set();
  }
  async addNotifiedThreshold(): Promise<void> {
    throw new Error('redis down');
  }
  async invalidateCall(): Promise<void> {}
}

class FakePublisher extends AchievementEventPublisher {
  public events: DomainEvent[] = [];
  async publish(event: DomainEvent): Promise<void> {
    this.events.push(event);
  }
  async publishAll(): Promise<void> {}
}

function makeCall(): MonitoredCallRecord {
  return {
    callId: 'call-1',
    chain: 'solana',
    address: 'ABC',
    mcAtCall: 10000,
    publishedAt: new Date(),
  };
}

describe('RecordNotifiedAchievementUseCase', () => {
  it('updates the cache with the notified threshold', async () => {
    const cache = new FakeCache();
    const publisher = new FakePublisher();
    const uc = new RecordNotifiedAchievementUseCase(cache, publisher);

    await uc.execute({
      monitoredCall: makeCall(),
      threshold: 2,
      currentMc: 25000,
    });

    expect(cache.added).toEqual([{ callId: 'call-1', threshold: 2 }]);
  });

  it('emits a CallAchievementReachedEvent with correct payload', async () => {
    const cache = new FakeCache();
    const publisher = new FakePublisher();
    const uc = new RecordNotifiedAchievementUseCase(cache, publisher);

    const call = makeCall();
    await uc.execute({ monitoredCall: call, threshold: 5, currentMc: 50000 });

    expect(publisher.events).toHaveLength(1);
    const evt = publisher.events[0] as unknown as CallAchievementReachedEvent;
    expect(evt.payload.callId).toBe('call-1');
    expect(evt.payload.chain).toBe('solana');
    expect(evt.payload.address).toBe('ABC');
    expect(evt.payload.multiple).toBe(5);
    expect(evt.payload.mcAtCall).toBe(10000);
    expect(evt.payload.mcNow).toBe(50000);
    expect(typeof evt.payload.notifiedAt).toBe('string');
  });

  it('does not throw when the cache fails (best-effort, event still emitted)', async () => {
    const cache = new FailingCache();
    const publisher = new FakePublisher();
    const uc = new RecordNotifiedAchievementUseCase(cache, publisher);

    await expect(
      uc.execute({
        monitoredCall: makeCall(),
        threshold: 4,
        currentMc: 40000,
      }),
    ).resolves.toBeUndefined();
    expect(publisher.events).toHaveLength(1);
  });

  it('returns void (no recorded-flag — dedup is downstream responsibility)', async () => {
    const cache = new FakeCache();
    const publisher = new FakePublisher();
    const uc = new RecordNotifiedAchievementUseCase(cache, publisher);

    const result = await uc.execute({
      monitoredCall: makeCall(),
      threshold: 2,
      currentMc: 25000,
    });

    expect(result).toBeUndefined();
  });

  it('updates the cache for each invocation regardless of duplicates (best-effort)', async () => {
    const cache = new FakeCache();
    const publisher = new FakePublisher();
    const uc = new RecordNotifiedAchievementUseCase(cache, publisher);

    // Authoritative dedup is downstream — this use case is intentionally idempotent
    // only in the sense that the cache update is a no-op for already-present entries.
    await uc.execute({
      monitoredCall: makeCall(),
      threshold: 3,
      currentMc: 30000,
    });
    await uc.execute({
      monitoredCall: makeCall(),
      threshold: 3,
      currentMc: 30000,
    });

    expect(cache.added).toEqual([
      { callId: 'call-1', threshold: 3 },
      { callId: 'call-1', threshold: 3 },
    ]);
    expect(publisher.events).toHaveLength(2);
  });
});