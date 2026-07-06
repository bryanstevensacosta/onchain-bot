import { EvaluateActiveCallsUseCase } from './evaluate-active-calls.use-case';
import { RecordNotifiedAchievementUseCase } from './record-notified-achievement.use-case';
import {
  MonitoredCallRecord,
  MonitoredCallRepository,
} from '../ports/monitored-call.repository';
import {
  AchievementThresholdRepository,
  AchievementThresholdRecord,
} from '../ports/achievement-threshold.repository';
import { LiveMarketDataPort } from '../ports/live-market-data.port';
import { AchievementCachePort } from '../ports/achievement-cache.port';
import { DetectCrossedAchievementsService } from '../services/detect-crossed-achievements.service';
import { ConfigService } from '@nestjs/config';

class FakeMonitoredRepo extends MonitoredCallRepository {
  public calls: MonitoredCallRecord[] = [];
  public updates: Array<{ id: string; at: Date }> = [];
  public deactivations: string[] = [];
  async findByChainAndAddress(): Promise<MonitoredCallRecord | null> {
    return null;
  }
  async findByCallId(): Promise<MonitoredCallRecord | null> {
    return null;
  }
  async findActive(
    _maxAgeMs: number,
    limit: number,
  ): Promise<MonitoredCallRecord[]> {
    return this.calls.slice(0, limit);
  }
  async save(c: MonitoredCallRecord): Promise<MonitoredCallRecord> {
    return c;
  }
  async updateLastEvaluated(id: string, at: Date): Promise<void> {
    this.updates.push({ id, at });
  }
  async deactivate(id: string): Promise<void> {
    this.deactivations.push(id);
  }
}

class FakeThresholdRepo extends AchievementThresholdRepository {
  public records: AchievementThresholdRecord[] = [];
  async findEnabled(): Promise<AchievementThresholdRecord[]> {
    return this.records;
  }
  async findAll(): Promise<AchievementThresholdRecord[]> {
    return this.records;
  }
  async findByMultiple(): Promise<AchievementThresholdRecord | null> {
    return null;
  }
  async save(
    r: AchievementThresholdRecord,
  ): Promise<AchievementThresholdRecord> {
    return r;
  }
  async replaceAll(): Promise<void> {}
  async count(): Promise<number> {
    return this.records.length;
  }
}

class FakeMarketData extends LiveMarketDataPort {
  public m: Map<string, number> = new Map();
  async fetchCurrentMc(): Promise<number | null> {
    return null;
  }
  async fetchCurrentMcBatch(): Promise<Map<string, number>> {
    return this.m;
  }
}

class FakeCache extends AchievementCachePort {
  public map: Map<string, Set<number>> = new Map();
  public getCalls = 0;
  async getNotifiedThresholds(callId: string): Promise<Set<number>> {
    this.getCalls++;
    return new Set(this.map.get(callId) ?? []);
  }
  async addNotifiedThreshold(callId: string, threshold: number): Promise<void> {
    const s = this.map.get(callId) ?? new Set<number>();
    s.add(threshold);
    this.map.set(callId, s);
  }
  async invalidateCall(): Promise<void> {}
}

class FakeRecordUseCase {
  public calls: Array<{ threshold: number; mcNow: number }> = [];
  async execute(input: {
    monitoredCall: MonitoredCallRecord;
    threshold: number;
    currentMc: number;
  }) {
    this.calls.push({ threshold: input.threshold, mcNow: input.currentMc });
  }
}

function makeConfig(activeHours = 72): ConfigService {
  return {
    get: (): { milestone: { activeWindowHours: number } } => ({
      milestone: { activeWindowHours: activeHours },
    }),
  } as unknown as ConfigService;
}

function callWithId(
  id: string,
  mcAtCall: number,
  ageMs: number,
): MonitoredCallRecord {
  return {
    id,
    callId: id,
    chain: 'solana',
    address: 'addr-' + id,
    mcAtCall,
    publishedAt: new Date(Date.now() - ageMs),
    lastEvaluatedAt: null,
  };
}

describe('EvaluateActiveCallsUseCase', () => {
  it('returns zeros when no active calls', async () => {
    const cache = new FakeCache();
    const uc = new EvaluateActiveCallsUseCase(
      new FakeMonitoredRepo(),
      new FakeThresholdRepo(),
      new FakeMarketData(),
      cache,
      new DetectCrossedAchievementsService(),
      new FakeRecordUseCase() as unknown as RecordNotifiedAchievementUseCase,
      makeConfig(),
    );
    const result = await uc.execute();
    expect(result).toEqual({ evaluated: 0, notified: 0, skipped: 0 });
    expect(cache.getCalls).toBe(0);
  });

  it('skips call when mcNow is null', async () => {
    const monitored = new FakeMonitoredRepo();
    monitored.calls = [callWithId('c1', 1000, 1000)];
    const record = new FakeRecordUseCase();
    const uc = new EvaluateActiveCallsUseCase(
      monitored,
      new FakeThresholdRepo(),
      new FakeMarketData(),
      new FakeCache(),
      new DetectCrossedAchievementsService(),
      record as unknown as RecordNotifiedAchievementUseCase,
      makeConfig(),
    );
    const result = await uc.execute();
    expect(result.skipped).toBe(1);
    expect(result.notified).toBe(0);
    expect(record.calls).toHaveLength(0);
  });

  it('skips call when mcAtCall is invalid', async () => {
    const monitored = new FakeMonitoredRepo();
    monitored.calls = [callWithId('c1', 0, 1000)];
    const market = new FakeMarketData();
    market.m.set('solana:addr-c1', 5000);
    const uc = new EvaluateActiveCallsUseCase(
      monitored,
      new FakeThresholdRepo(),
      market,
      new FakeCache(),
      new DetectCrossedAchievementsService(),
      new FakeRecordUseCase() as unknown as RecordNotifiedAchievementUseCase,
      makeConfig(),
    );
    const result = await uc.execute();
    expect(result.skipped).toBe(1);
  });

  it('records new achievements when multiple crosses enabled thresholds', async () => {
    const monitored = new FakeMonitoredRepo();
    monitored.calls = [callWithId('c1', 1000, 1000)];
    const market = new FakeMarketData();
    market.m.set('solana:addr-c1', 5000);
    const thresholds = new FakeThresholdRepo();
    thresholds.records = [{ multiple: 2 }, { multiple: 3 }, { multiple: 5 }];
    const record = new FakeRecordUseCase();
    const uc = new EvaluateActiveCallsUseCase(
      monitored,
      thresholds,
      market,
      new FakeCache(),
      new DetectCrossedAchievementsService(),
      record as unknown as RecordNotifiedAchievementUseCase,
      makeConfig(),
    );
    const result = await uc.execute();
    expect(result.notified).toBe(3);
    expect(record.calls.map((c) => c.threshold)).toEqual([2, 3, 5]);
  });

  it('uses cache-only dedup (no DB repo consulted)', async () => {
    const monitored = new FakeMonitoredRepo();
    monitored.calls = [callWithId('c1', 1000, 1000)];
    const market = new FakeMarketData();
    market.m.set('solana:addr-c1', 5000);
    const thresholds = new FakeThresholdRepo();
    thresholds.records = [{ multiple: 2 }, { multiple: 3 }, { multiple: 5 }];
    const cache = new FakeCache();
    // Mark 2x as already notified (cache-only path)
    cache.map.set('c1', new Set([2]));
    const record = new FakeRecordUseCase();
    const uc = new EvaluateActiveCallsUseCase(
      monitored,
      thresholds,
      market,
      cache,
      new DetectCrossedAchievementsService(),
      record as unknown as RecordNotifiedAchievementUseCase,
      makeConfig(),
    );
    const result = await uc.execute();
    // 2x is deduped; 3x and 5x are recorded
    expect(result.notified).toBe(2);
    expect(record.calls.map((c) => c.threshold)).toEqual([3, 5]);
    // Cache get was consulted (per-call)
    expect(cache.getCalls).toBe(1);
  });

  it('updates lastEvaluatedAt on each call', async () => {
    const monitored = new FakeMonitoredRepo();
    monitored.calls = [callWithId('c1', 1000, 1000)];
    const market = new FakeMarketData();
    market.m.set('solana:addr-c1', 2000);
    const uc = new EvaluateActiveCallsUseCase(
      monitored,
      new FakeThresholdRepo(),
      market,
      new FakeCache(),
      new DetectCrossedAchievementsService(),
      new FakeRecordUseCase() as unknown as RecordNotifiedAchievementUseCase,
      makeConfig(),
    );
    await uc.execute();
    expect(monitored.updates).toHaveLength(1);
  });

  it('deactivates stale calls', async () => {
    const monitored = new FakeMonitoredRepo();
    monitored.calls = [callWithId('c1', 1000, 1000 * 3600 * 100)];
    const market = new FakeMarketData();
    market.m.set('solana:addr-c1', 2000);
    const uc = new EvaluateActiveCallsUseCase(
      monitored,
      new FakeThresholdRepo(),
      market,
      new FakeCache(),
      new DetectCrossedAchievementsService(),
      new FakeRecordUseCase() as unknown as RecordNotifiedAchievementUseCase,
      makeConfig(1),
    );
    await uc.execute();
    expect(monitored.deactivations).toEqual(['c1']);
  });
});
