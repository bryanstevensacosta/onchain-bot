import { RecordNotifiedMilestoneUseCase } from './record-notified-milestone.use-case';
import {
  NotifiedMilestoneRepository,
  NotifiedMilestoneRecord,
} from '../ports/notified-milestone.repository';
import { MilestoneCachePort } from '../ports/milestone-cache.port';
import { MilestoneEventPublisher } from '../ports/milestone-event.publisher';
import { DomainEvent } from 'shared/kernel/domain-event';
import { MonitoredCallRecord } from '../ports/monitored-call.repository';

class FakeRepo extends NotifiedMilestoneRepository {
  public exists = false;
  public saved: NotifiedMilestoneRecord[] = [];
  async findByCall(): Promise<NotifiedMilestoneRecord[]> {
    return [];
  }
  async findThresholdsForCall(): Promise<number[]> {
    return [];
  }
  async existsByCallAndThreshold(): Promise<boolean> {
    return this.exists;
  }
  async save(rec: NotifiedMilestoneRecord): Promise<NotifiedMilestoneRecord> {
    this.saved.push(rec);
    return rec;
  }
  async countByCall(): Promise<number> {
    return 0;
  }
}

class FakeCache extends MilestoneCachePort {
  public added: Array<{ callId: string; threshold: number }> = [];
  async getNotifiedThresholds(): Promise<Set<number>> {
    return new Set();
  }
  async addNotifiedThreshold(callId: string, threshold: number): Promise<void> {
    this.added.push({ callId, threshold });
  }
  async invalidateCall(): Promise<void> {}
}

class FakePublisher extends MilestoneEventPublisher {
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

describe('RecordNotifiedMilestoneUseCase', () => {
  it('records new milestone and emits event', async () => {
    const repo = new FakeRepo();
    const cache = new FakeCache();
    const publisher = new FakePublisher();
    const uc = new RecordNotifiedMilestoneUseCase(repo, cache, publisher);

    const result = await uc.execute({
      monitoredCall: makeCall(),
      threshold: 2,
      currentMc: 25000,
    });

    expect(result.recorded).toBe(true);
    expect(repo.saved).toHaveLength(1);
    expect(publisher.events).toHaveLength(1);
    expect((publisher.events[0] as any).payload.multiple).toBe(2);
  });

  it('skips when already exists in DB', async () => {
    const repo = new FakeRepo();
    repo.exists = true;
    const cache = new FakeCache();
    const publisher = new FakePublisher();
    const uc = new RecordNotifiedMilestoneUseCase(repo, cache, publisher);

    const result = await uc.execute({
      monitoredCall: makeCall(),
      threshold: 2,
      currentMc: 25000,
    });

    expect(result.recorded).toBe(false);
    expect(repo.saved).toHaveLength(0);
    expect(publisher.events).toHaveLength(0);
  });

  it('updates cache after save', async () => {
    const repo = new FakeRepo();
    const cache = new FakeCache();
    const publisher = new FakePublisher();
    const uc = new RecordNotifiedMilestoneUseCase(repo, cache, publisher);

    await uc.execute({
      monitoredCall: makeCall(),
      threshold: 3,
      currentMc: 30000,
    });

    expect(cache.added).toEqual([{ callId: 'call-1', threshold: 3 }]);
  });

  it('does not throw on cache failure', async () => {
    const repo = new FakeRepo();
    const cache = new FailingCache();
    const publisher = new FakePublisher();
    const uc = new RecordNotifiedMilestoneUseCase(repo, cache, publisher);

    const result = await uc.execute({
      monitoredCall: makeCall(),
      threshold: 4,
      currentMc: 40000,
    });
    expect(result.recorded).toBe(true);
    expect(publisher.events).toHaveLength(1);
  });

  it('emits correct event payload', async () => {
    const repo = new FakeRepo();
    const cache = new FakeCache();
    const publisher = new FakePublisher();
    const uc = new RecordNotifiedMilestoneUseCase(repo, cache, publisher);

    const call = makeCall();
    await uc.execute({ monitoredCall: call, threshold: 5, currentMc: 50000 });

    const evt = publisher.events[0] as any;
    expect(evt.payload.callId).toBe('call-1');
    expect(evt.payload.chain).toBe('solana');
    expect(evt.payload.address).toBe('ABC');
    expect(evt.payload.multiple).toBe(5);
    expect(evt.payload.mcAtCall).toBe(10000);
    expect(evt.payload.mcNow).toBe(50000);
    expect(typeof evt.payload.notifiedAt).toBe('string');
  });
});

class FailingCache extends MilestoneCachePort {
  async getNotifiedThresholds(): Promise<Set<number>> {
    return new Set();
  }
  async addNotifiedThreshold(): Promise<void> {
    throw new Error('redis down');
  }
  async invalidateCall(): Promise<void> {}
}
