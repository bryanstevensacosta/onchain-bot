import { UpdateTrackedCallsUseCase } from './update-tracked-calls.use-case';
import {
  TrackedPublishedCallRepository,
  TrackedPublishedCallRecord,
} from '../ports/tracked-published-call.repository';
import { LiveMarketDataPort } from 'token/milestone/application/ports/live-market-data.port';
import { MilestoneThresholdRepository } from 'token/milestone/application/ports/milestone-threshold.repository';
import { MilestoneCachePort } from 'token/milestone/application/ports/milestone-cache.port';

class StubTrackedRepo extends TrackedPublishedCallRepository {
  records = new Map<string, TrackedPublishedCallRecord>();
  async findByChainAndAddress(chain: string, address: string) {
    return this.records.get(`${chain}:${address.toLowerCase()}`) ?? null;
  }
  async findActive(limit: number) {
    return Array.from(this.records.values())
      .filter((r) => r.isActive)
      .slice(0, limit);
  }
  async findMany() {
    return [];
  }
  async save(record: TrackedPublishedCallRecord) {
    this.records.set(`${record.chain}:${record.address.toLowerCase()}`, {
      ...record,
    });
    return record;
  }
}

class StubMarketData extends LiveMarketDataPort {
  map = new Map<string, number>();
  async fetchCurrentMc() {
    return null;
  }
  async fetchCurrentMcBatch(
    items: ReadonlyArray<{ chain: string; address: string }>,
  ) {
    const out = new Map<string, number>();
    for (const it of items) {
      const k = `${it.chain}:${it.address.toLowerCase()}`;
      const v = this.map.get(k);
      if (v !== undefined) out.set(k, v);
    }
    return out;
  }
}

class StubThresholds extends MilestoneThresholdRepository {
  multiples: number[] = [];
  async findEnabled() {
    return this.multiples.map((m) => ({ multiple: m }));
  }
  async findAll() {
    return this.multiples.map((m) => ({ multiple: m }));
  }
  async findByMultiple() {
    return null;
  }
  async save() {
    return { multiple: 0 };
  }
  async replaceAll() {
    /* noop */
  }
  async count() {
    return this.multiples.length;
  }
}

class StubCache extends MilestoneCachePort {
  notified = new Map<string, Set<number>>();
  async getNotifiedThresholds(callId: string) {
    return new Set(this.notified.get(callId) ?? []);
  }
  async addNotifiedThreshold(callId: string, t: number) {
    const set = this.notified.get(callId) ?? new Set<number>();
    set.add(t);
    this.notified.set(callId, set);
  }
  async invalidateCall(callId: string) {
    this.notified.delete(callId);
  }
}

function seedRepo(
  repo: StubTrackedRepo,
  items: Array<
    Partial<TrackedPublishedCallRecord> & { chain: string; address: string }
  >,
) {
  for (const it of items) {
    const address = it.address.toLowerCase();
    const base: TrackedPublishedCallRecord = {
      id: `${it.chain}:${address}`,
      kolId: 'kol_x',
      chain: it.chain,
      address,
      ticker: null,
      mcAtPublish: 1000,
      mcNow: null,
      milestonesHit: [],
      maxMilestone: null,
      priceDropPercent: null,
      publishedAt: new Date(),
      lastUpdatedAt: new Date(),
      isActive: true,
      ...it,
      address,
    };
    repo.records.set(`${it.chain}:${address}`, base);
  }
}

describe('UpdateTrackedCallsUseCase', () => {
  it('returns zero counts when no active calls', async () => {
    const uc = new UpdateTrackedCallsUseCase(
      new StubTrackedRepo(),
      new StubMarketData(),
      new StubThresholds(),
      new StubCache(),
    );
    const res = await uc.execute();
    expect(res).toEqual({ evaluated: 0, updated: 0, skipped: 0 });
  });

  it('updates mcNow and computes price drop + milestones', async () => {
    const repo = new StubTrackedRepo();
    seedRepo(repo, [{ chain: 'solana', address: 'A', mcAtPublish: 1000 }]);
    const market = new StubMarketData();
    market.map.set('solana:a', 2500);
    const thresholds = new StubThresholds();
    thresholds.multiples = [2, 3, 5];
    const cache = new StubCache();
    const uc = new UpdateTrackedCallsUseCase(repo, market, thresholds, cache);

    const res = await uc.execute();
    expect(res.updated).toBe(1);
    const updated = repo.records.get('solana:a');
    expect(updated?.mcNow).toBe(2500);
    expect(updated?.priceDropPercent).toBe(150);
    expect(updated?.milestonesHit).toEqual([2]);
    expect(updated?.maxMilestone).toBe(2);
  });

  it('skips when mcNow is missing from market data', async () => {
    const repo = new StubTrackedRepo();
    seedRepo(repo, [{ chain: 'solana', address: 'A' }]);
    const uc = new UpdateTrackedCallsUseCase(
      repo,
      new StubMarketData(),
      new StubThresholds(),
      new StubCache(),
    );
    const res = await uc.execute();
    expect(res.skipped).toBe(1);
    expect(res.updated).toBe(0);
  });

  it('skips when mcAtPublish is 0 (no baseline)', async () => {
    const repo = new StubTrackedRepo();
    seedRepo(repo, [{ chain: 'solana', address: 'A', mcAtPublish: 0 }]);
    const market = new StubMarketData();
    market.map.set('solana:a', 5000);
    const uc = new UpdateTrackedCallsUseCase(
      repo,
      market,
      new StubThresholds(),
      new StubCache(),
    );
    const res = await uc.execute();
    expect(res.skipped).toBe(1);
  });

  it('excludes milestones already in cache (dedupe)', async () => {
    const repo = new StubTrackedRepo();
    seedRepo(repo, [{ chain: 'solana', address: 'A', mcAtPublish: 1000 }]);
    const market = new StubMarketData();
    market.map.set('solana:a', 5000);
    const thresholds = new StubThresholds();
    thresholds.multiples = [2, 3, 5];
    const cache = new StubCache();
    cache.notified.set('solana:a', new Set([2]));
    const uc = new UpdateTrackedCallsUseCase(repo, market, thresholds, cache);
    await uc.execute();
    const updated = repo.records.get('solana:a');
    expect(updated?.milestonesHit).toEqual([3, 5]);
  });

  it('respects batchSize', async () => {
    const repo = new StubTrackedRepo();
    for (let i = 0; i < 5; i++)
      seedRepo(repo, [{ chain: 'solana', address: `A${i}` }]);
    const market = new StubMarketData();
    for (let i = 0; i < 5; i++) market.map.set(`solana:a${i}`, 2000);
    const uc = new UpdateTrackedCallsUseCase(
      repo,
      market,
      new StubThresholds(),
      new StubCache(),
    );
    const res = await uc.execute({ batchSize: 2 });
    expect(res.evaluated).toBe(2);
  });
});
