/* eslint-disable @typescript-eslint/unbound-method */
import { ConfigService } from '@nestjs/config';
import { EvaluateActiveCallsUseCase } from './evaluate-active-calls.use-case';
import { RecordNotifiedMilestoneUseCase } from './record-notified-milestone.use-case';
import {
  MonitoredCallRecord,
  MonitoredCallRepository,
} from '../ports/monitored-call.repository';
import {
  MilestoneThresholdRepository,
  MilestoneThresholdRecord,
} from '../ports/milestone-threshold.repository';
import { LiveMarketDataPort } from '../ports/live-market-data.port';
import { MilestoneCachePort } from '../ports/milestone-cache.port';
import { NotifiedMilestoneRepository } from '../ports/notified-milestone.repository';
import { MilestoneEventPublisher } from '../ports/milestone-event.publisher';
import { DetectCrossedMilestonesService } from '../services/detect-crossed-milestones.service';
import { InMemoryNotifiedMilestoneRepository } from '../../infrastructure/repositories/in-memory-notified-milestone.repository';
import { DomainEvent } from 'shared/kernel/domain-event';
import type { AppConfig } from 'shared/common/config/app.config';

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

class FakeThresholdRepo extends MilestoneThresholdRepository {
  constructor(thresholds: number[]) {
    super();
    this.records = thresholds.map((t) => ({
      id: `id-${t}`,
      multiple: t,
      enabled: true,
    }));
  }
  public records: MilestoneThresholdRecord[];
  async findEnabled(): Promise<MilestoneThresholdRecord[]> {
    return this.records;
  }
  async findAll(): Promise<MilestoneThresholdRecord[]> {
    return this.records;
  }
  async findByMultiple(): Promise<MilestoneThresholdRecord | null> {
    return null;
  }
  async save(r: MilestoneThresholdRecord): Promise<MilestoneThresholdRecord> {
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

class FakeCache extends MilestoneCachePort {
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

class FakePublisher extends MilestoneEventPublisher {
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
  notifiedRepo: InMemoryNotifiedMilestoneRepository,
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
  const thresholdRepo = new FakeThresholdRepo(overrides.thresholds ?? [2, 3, 5]);
  const marketData = new FakeMarketData();
  marketData.m = overrides.mcMap ?? new Map();
  const cache =
    overrides.cache ??
    ((): FakeCache => {
      const c = new FakeCache();
      if (overrides.cacheGetShouldThrow) {
        const originalGet = c.getNotifiedThresholds.bind(c);
        c.getNotifiedThresholds = async (): Promise<Set<number>> => {
          throw new Error('redis read failed');
        };
        void originalGet;
      }
      return c;
    })();
  const detector = new DetectCrossedMilestonesService();
  const publisher = new FakePublisher();
  const recordUseCase = new RecordNotifiedMilestoneUseCase(
    notifiedRepo,
    cache,
    publisher,
  );
  const config = new FakeConfig() as unknown as ConfigService;
  const useCase = new EvaluateActiveCallsUseCase(
    monitoredRepo,
    thresholdRepo,
    marketData,
    cache,
    notifiedRepo,
    detector,
    recordUseCase,
    config,
  );
  return { useCase, monitoredRepo, cache, publisher, notifiedRepo };
}

describe('EvaluateActiveCallsUseCase — Redis dedup integration', () => {
  describe('cache + DB union dedup', () => {
    it('does NOT re-record when threshold is in cache only', async () => {
      const notifiedRepo = new InMemoryNotifiedMilestoneRepository();
      const cache = new FakeCache();
      cache.map.set('call-1', new Set([2]));
      const mcMap = new Map([['solana:abc', 25000]]); // 2.5x
      const { useCase, publisher } = buildUseCase(notifiedRepo, {
        cache,
        monitoredCalls: [makeCall('call-1', 10000)],
        mcMap,
      });

      const result = await useCase.execute();

      expect(result.notified).toBe(0);
      expect(publisher.events).toHaveLength(0);
    });

    it('does NOT re-record when ALL crossed thresholds are in DB only', async () => {
      const notifiedRepo = new InMemoryNotifiedMilestoneRepository();
      await notifiedRepo.save({
        callId: 'call-1',
        threshold: 2,
        notifiedAt: new Date(),
      });
      await notifiedRepo.save({
        callId: 'call-1',
        threshold: 3,
        notifiedAt: new Date(),
      });
      const cache = new FakeCache();
      const mcMap = new Map([['solana:abc', 35000]]);
      const { useCase, publisher } = buildUseCase(notifiedRepo, {
        cache,
        monitoredCalls: [makeCall('call-1', 10000)],
        mcMap,
      });

      const result = await useCase.execute();

      expect(result.notified).toBe(0);
      expect(publisher.events).toHaveLength(0);
    });

    it('does NOT re-record when threshold is in both cache and DB (deduplicated union)', async () => {
      const notifiedRepo = new InMemoryNotifiedMilestoneRepository();
      await notifiedRepo.save({
        callId: 'call-1',
        threshold: 2,
        notifiedAt: new Date(),
      });
      const cache = new FakeCache();
      cache.map.set('call-1', new Set([2]));
      const mcMap = new Map([['solana:abc', 25000]]); // 2.5x
      const { useCase, publisher } = buildUseCase(notifiedRepo, {
        cache,
        monitoredCalls: [makeCall('call-1', 10000)],
        mcMap,
      });

      const result = await useCase.execute();

      expect(result.notified).toBe(0);
      expect(publisher.events).toHaveLength(0);
    });

    it('records when threshold is in neither cache nor DB', async () => {
      const notifiedRepo = new InMemoryNotifiedMilestoneRepository();
      const cache = new FakeCache(); // empty
      const mcMap = new Map([['solana:abc', 25000]]); // 2.5x
      const { useCase, publisher } = buildUseCase(notifiedRepo, {
        cache,
        monitoredCalls: [makeCall('call-1', 10000)],
        mcMap,
      });

      const result = await useCase.execute();

      expect(result.notified).toBe(1);
      expect(publisher.events).toHaveLength(1);
    });

    it('records only NEW crossings (mix of old + new thresholds)', async () => {
      const notifiedRepo = new InMemoryNotifiedMilestoneRepository();
      await notifiedRepo.save({
        callId: 'call-1',
        threshold: 2,
        notifiedAt: new Date(),
      });
      const cache = new FakeCache();
      cache.map.set('call-1', new Set([3]));
      const mcMap = new Map([['solana:abc', 50000]]); // 5x — crosses 2, 3, 5
      const { useCase, publisher } = buildUseCase(notifiedRepo, {
        cache,
        monitoredCalls: [makeCall('call-1', 10000)],
        mcMap,
      });

      const result = await useCase.execute();

      expect(result.notified).toBe(1); // only 5x new
      expect(publisher.events).toHaveLength(1);
      expect((publisher.events[0] as unknown as { payload: { multiple: number } }).payload.multiple).toBe(5);
    });
  });

  describe('write-through best-effort', () => {
    it('still records to DB when cache.addNotifiedThreshold fails', async () => {
      const notifiedRepo = new InMemoryNotifiedMilestoneRepository();
      const cache = new FakeCache();
      cache.failAdd = true;
      const mcMap = new Map([['solana:abc', 25000]]);
      const { useCase, publisher } = buildUseCase(notifiedRepo, {
        cache,
        monitoredCalls: [makeCall('call-1', 10000)],
        mcMap,
      });

      const result = await useCase.execute();

      expect(result.notified).toBe(1);
      expect(publisher.events).toHaveLength(1);
      // DB still has the record (DB is source of truth)
      const dbThresholds = await notifiedRepo.findThresholdsForCall('call-1');
      expect(dbThresholds).toEqual([2]);
    });

    it('propagates cache.getNotifiedThresholds throw (cache adapter should swallow internally)', async () => {
      const notifiedRepo = new InMemoryNotifiedMilestoneRepository();
      const mcMap = new Map([['solana:abc', 25000]]);
      const { useCase } = buildUseCase(notifiedRepo, {
        cacheGetShouldThrow: true,
        monitoredCalls: [makeCall('call-1', 10000)],
        mcMap,
      });

      // Note: RedisMilestoneCacheAdapter swallows smembers errors internally and
      // returns empty Set, so in production this throw never reaches the use case.
      // This test pins down the current contract: if a cache adapter throws, the
      // use case propagates (no try/catch wrapper at the use-case level).
      await expect(useCase.execute()).rejects.toThrow('redis read failed');
    });
  });
});