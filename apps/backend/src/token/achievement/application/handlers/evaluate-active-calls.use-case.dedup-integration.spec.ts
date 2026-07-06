import { ConfigService } from '@nestjs/config';
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
import { AchievementEventPublisher } from '../ports/achievement-event.publisher';
import { DetectCrossedAchievementsService } from '../services/detect-crossed-achievements.service';
import { DomainEvent } from 'shared/kernel/domain-event';

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
  constructor(thresholds: number[]) {
    super();
    this.records = thresholds.map((t) => ({
      id: t,
      multiple: t,
      enabled: true,
    }));
  }
  public records: AchievementThresholdRecord[];
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
  public failAdd = false;
  async getNotifiedThresholds(callId: string): Promise<Set<number>> {
    return new Set(this.map.get(callId) ?? []);
  }
  async addNotifiedThreshold(callId: string, threshold: number): Promise<void> {
    if (this.failAdd) throw new Error('redis cache down');
    const s = this.map.get(callId) ?? new Set<number>();
    s.add(threshold);
    this.map.set(callId, s);
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

class FakeConfig {
  constructor(
    private readonly activeWindowHours: number = 72,
    private readonly milestoneConfig: Record<string, unknown> = {},
  ) {}
  get<T>(key: string): T {
    if (key === 'app') {
      return {
        milestone: {
          activeWindowHours: this.activeWindowHours,
          ...this.milestoneConfig,
        },
      } as T;
    }
    return {} as T;
  }
}

function makeCall(callId: string, mcAtCall: number): MonitoredCallRecord {
  return {
    id: callId,
    callId,
    chain: 'solana',
    address: 'abc',
    mcAtCall,
    publishedAt: new Date(Date.now() - 1000),
  };
}

function buildUseCase(
  overrides: {
    cache?: FakeCache;
    cacheGetShouldThrow?: boolean;
    monitoredCalls?: MonitoredCallRecord[];
    mcMap?: Map<string, number>;
    thresholds?: number[];
  } = {},
) {
  const monitoredRepo = new FakeMonitoredRepo();
  monitoredRepo.calls = overrides.monitoredCalls ?? [];
  const thresholdRepo = new FakeThresholdRepo(
    overrides.thresholds ?? [2, 3, 5],
  );
  const marketData = new FakeMarketData();
  marketData.m = overrides.mcMap ?? new Map<string, number>();
  const cache =
    overrides.cache ??
    ((): FakeCache => {
      const c = new FakeCache();
      if (overrides.cacheGetShouldThrow) {
        c.getNotifiedThresholds = async (): Promise<Set<number>> => {
          throw new Error('redis read failed');
        };
      }
      return c;
    })();
  const detector = new DetectCrossedAchievementsService();
  const publisher = new FakePublisher();
  // RecordNotifiedAchievementUseCase no longer depends on a DB repo —
  // dedup is downstream in vip-achievement's handler. This use case is a
  // thin orchestrator: cache memo + event publish.
  const recordUseCase = new RecordNotifiedAchievementUseCase(cache, publisher);
  const config = new FakeConfig() as unknown as ConfigService;
  const useCase = new EvaluateActiveCallsUseCase(
    monitoredRepo,
    thresholdRepo,
    marketData,
    cache,
    detector,
    recordUseCase,
    config,
  );
  return { useCase, monitoredRepo, cache, publisher, recordUseCase };
}

describe('EvaluateActiveCallsUseCase — cache-only dedup integration', () => {
  describe('cache-only dedup', () => {
    it('does NOT re-record when threshold is in cache only', async () => {
      const cache = new FakeCache();
      cache.map.set('call-1', new Set([2]));
      const mcMap = new Map([['solana:abc', 25000]]); // 2.5x
      const { useCase, publisher } = buildUseCase({
        cache,
        monitoredCalls: [makeCall('call-1', 10000)],
        mcMap,
      });

      const result = await useCase.execute();

      expect(result.notified).toBe(0);
      expect(publisher.events).toHaveLength(0);
    });

    it('records when threshold is in neither cache nor any other store', async () => {
      const cache = new FakeCache(); // empty
      const mcMap = new Map([['solana:abc', 25000]]); // 2.5x
      const { useCase, publisher } = buildUseCase({
        cache,
        monitoredCalls: [makeCall('call-1', 10000)],
        mcMap,
      });

      const result = await useCase.execute();

      expect(result.notified).toBe(1);
      expect(publisher.events).toHaveLength(1);
      // Side-effect: cache is updated as best-effort memoization
      expect(cache.map.get('call-1')).toEqual(new Set([2]));
    });

    it('records only NEW crossings (mix of old + new thresholds)', async () => {
      const cache = new FakeCache();
      // Cache "knows" 2x and 3x were already notified
      cache.map.set('call-1', new Set([2, 3]));
      const mcMap = new Map([['solana:abc', 50000]]); // 5x — crosses 2, 3, 5
      const { useCase, publisher } = buildUseCase({
        cache,
        monitoredCalls: [makeCall('call-1', 10000)],
        mcMap,
      });

      const result = await useCase.execute();

      expect(result.notified).toBe(1); // only 5x is new
      expect(publisher.events).toHaveLength(1);
      expect(
        (publisher.events[0] as unknown as { payload: { multiple: number } })
          .payload.multiple,
      ).toBe(5);
      // Cache now also has 5x
      expect(cache.map.get('call-1')).toEqual(new Set([2, 3, 5]));
    });

    it('treats a fresh process (cold cache) as "nothing notified yet"', async () => {
      // Even if the DB has records (vip-achievement authoritative dedup),
      // a cold cache must NOT block notifications — the vip-achievement
      // handler is the race-free source of truth.
      const cache = new FakeCache(); // cold
      const mcMap = new Map([['solana:abc', 25000]]); // 2.5x — crosses only 2x
      const { useCase, publisher } = buildUseCase({
        cache,
        monitoredCalls: [makeCall('call-1', 10000)],
        mcMap,
      });

      const result = await useCase.execute();

      // 2x is re-emitted; vip-achievement handler will dedup atomically.
      expect(result.notified).toBe(1);
      expect(publisher.events).toHaveLength(1);
    });
  });

  describe('write-through best-effort (cache)', () => {
    it('still emits the event when cache.addNotifiedThreshold fails', async () => {
      const cache = new FakeCache();
      cache.failAdd = true;
      const mcMap = new Map([['solana:abc', 25000]]);
      const { useCase, publisher } = buildUseCase({
        cache,
        monitoredCalls: [makeCall('call-1', 10000)],
        mcMap,
      });

      const result = await useCase.execute();

      // Cache write failed but the event still goes out —
      // vip-achievement handler is the authoritative dedup.
      expect(result.notified).toBe(1);
      expect(publisher.events).toHaveLength(1);
      // Cache map is empty (the add failed)
      expect(cache.map.get('call-1')).toBeUndefined();
    });

    it('propagates cache.getNotifiedThresholds throw (cache adapter should swallow internally)', async () => {
      const mcMap = new Map([['solana:abc', 25000]]);
      const { useCase } = buildUseCase({
        cacheGetShouldThrow: true,
        monitoredCalls: [makeCall('call-1', 10000)],
        mcMap,
      });

      // Note: RedisAchievementCacheAdapter swallows smembers errors internally and
      // returns empty Set, so in production this throw never reaches the use case.
      // This test pins down the current contract: if a cache adapter throws, the
      // use case propagates (no try/catch wrapper at the use-case level).
      await expect(useCase.execute()).rejects.toThrow('redis read failed');
    });
  });
});
