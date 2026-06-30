import { EvaluateActiveCallsUseCase } from './evaluate-active-calls.use-case';
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
import { NotifiedAchievementRepository } from '../ports/notified-achievement.repository';
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
  async save(r: AchievementThresholdRecord): Promise<AchievementThresholdRecord> {
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
  async getNotifiedThresholds(callId: string): Promise<Set<number>> {
    return new Set(this.map.get(callId) ?? []);
  }
  async addNotifiedThreshold(callId: string, threshold: number): Promise<void> {
    const s = this.map.get(callId) ?? new Set<number>();
    s.add(threshold);
    this.map.set(callId, s);
  }
  async invalidateCall(): Promise<void> {}
}

class FakeNotifiedRepo extends NotifiedAchievementRepository {
  public map: Map<string, Set<number>> = new Map();
  async findByCall(): Promise<any[]> {
    return [];
  }
  async findThresholdsForCall(callId: string): Promise<number[]> {
    return [...(this.map.get(callId) ?? [])];
  }
  async existsByCallAndThreshold(): Promise<boolean> {
    return false;
  }
  async save(): Promise<any> {
    return null;
  }
  async countByCall(): Promise<number> {
    return 0;
  }
}

class FakeRecordUseCase {
  public calls: Array<{ threshold: number; mcNow: number }> = [];
  async execute(input: {
    monitoredCall: MonitoredCallRecord;
    threshold: number;
    currentMc: number;
  }) {
    this.calls.push({ threshold: input.threshold, mcNow: input.currentMc });
    return { recorded: true };
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
    const uc = new EvaluateActiveCallsUseCase(
      new FakeMonitoredRepo(),
      new FakeThresholdRepo(),
      new FakeMarketData(),
      new FakeCache(),
      new FakeNotifiedRepo(),
      new DetectCrossedAchievementsService(),
      new FakeRecordUseCase() as any,
      makeConfig(),
    );
    const result = await uc.execute();
    expect(result).toEqual({ evaluated: 0, notified: 0, skipped: 0 });
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
      new FakeNotifiedRepo(),
      new DetectCrossedAchievementsService(),
      record as any,
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
      new FakeNotifiedRepo(),
      new DetectCrossedAchievementsService(),
      new FakeRecordUseCase() as any,
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
      new FakeNotifiedRepo(),
      new DetectCrossedAchievementsService(),
      record as any,
      makeConfig(),
    );
    const result = await uc.execute();
    expect(result.notified).toBe(3);
    expect(record.calls.map((c) => c.threshold)).toEqual([2, 3, 5]);
  });

  it('merges cache + DB dedup sets correctly', async () => {
    const monitored = new FakeMonitoredRepo();
    monitored.calls = [callWithId('c1', 1000, 1000)];
    const market = new FakeMarketData();
    market.m.set('solana:addr-c1', 5000);
    const thresholds = new FakeThresholdRepo();
    thresholds.records = [{ multiple: 2 }, { multiple: 3 }, { multiple: 5 }];
    const cache = new FakeCache();
    cache.map.set('c1', new Set([2]));
    const notified = new FakeNotifiedRepo();
    notified.map.set('c1', new Set([3]));
    const record = new FakeRecordUseCase();
    const uc = new EvaluateActiveCallsUseCase(
      monitored,
      thresholds,
      market,
      cache,
      notified,
      new DetectCrossedAchievementsService(),
      record as any,
      makeConfig(),
    );
    const result = await uc.execute();
    expect(result.notified).toBe(1);
    expect(record.calls.map((c) => c.threshold)).toEqual([5]);
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
      new FakeNotifiedRepo(),
      new DetectCrossedAchievementsService(),
      new FakeRecordUseCase() as any,
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
      new FakeNotifiedRepo(),
      new DetectCrossedAchievementsService(),
      new FakeRecordUseCase() as any,
      makeConfig(1),
    );
    await uc.execute();
    expect(monitored.deactivations).toEqual(['c1']);
  });
});
