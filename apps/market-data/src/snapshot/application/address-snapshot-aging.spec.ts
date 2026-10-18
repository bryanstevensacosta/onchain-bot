import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import { DirectFastPathService } from './direct-fast-path.service';
import { AddressExistenceService } from './address-existence.service';
import { PendingAgingService } from './pending-aging.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { ChainCatalogPort } from 'chain/application/ports/chain-catalog.port';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { DevHoldingsPort } from 'holders/domain/holdings.port';
import {
  SNAPSHOT_QUOTE_PROVIDERS,
  type SnapshotQuote,
} from '../domain/snapshot-quote.types';
import { agingEscalationNote } from '../domain/snapshot-latency';

/**
 * Pending aging (dexter plan todo 21d): N consecutive pendings for
 * the same (chain, address, kind) within the window escalate the card
 * to a differentiated `invalid` (`providerErrors.aging`) instead of
 * pending-forever; the entry is KEPT so every further pending
 * re-escalates; fresh data / SWR / a definitive existence verdict
 * clear it; the background refresh never records (pinned in the SWR
 * suite). This module deliberately does NOT import `CacheModule`: the
 * escalated invalid is cached for 30s in prod, and this suite pins
 * the re-escalation path deterministically (the 19a/19b1-era pattern
 * — "DI harnesses without a cache stay deterministic"). All adapters
 * stubbed — zero network.
 */
const CHAIN = 'robinhood';
const TOKEN = '0xAbCd000000000000000000000000000000000001';
const input = { chain: CHAIN, value: TOKEN, kindHint: 'token' as const };
const WINDOW_MS = 600_000;

type FetcherMode = 'ok' | 'fail';

interface FetcherState {
  mode: FetcherMode;
  calls: number;
}

interface ExistenceState {
  verdict: 'exists' | 'missing' | 'unresolved';
  reason: string;
  readonly calls: Array<{ chain: string; address: string; kind: string }>;
}

interface Harness {
  readonly snapshots: AddressSnapshotService;
  readonly history: SnapshotHistoryRepository;
  readonly aging: PendingAgingService;
  readonly fetchState: FetcherState;
  readonly existence: ExistenceState;
}

const modules: TestingModule[] = [];
const originalAgingN = process.env['SNAPSHOT_PENDING_AGING_N'];
const originalAgingWindowMs = process.env['SNAPSHOT_PENDING_AGING_WINDOW_MS'];

beforeEach(() => {
  // Env hygiene: the aging thresholds are read at construction — every
  // test starts from the pinned defaults and sets overrides explicitly.
  delete process.env['SNAPSHOT_PENDING_AGING_N'];
  delete process.env['SNAPSHOT_PENDING_AGING_WINDOW_MS'];
});

async function harness(): Promise<Harness> {
  const fetchState: FetcherState = { mode: 'fail', calls: 0 };
  const existence: ExistenceState = {
    verdict: 'unresolved',
    reason: 'spec stub (fail-open)',
    calls: [],
  };
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      SnapshotModule,
    ],
  })
    .overrideProvider(SNAPSHOT_QUOTE_PROVIDERS)
    .useValue([
      {
        name: 'stub-native',
        supportsChains: [CHAIN],
        fetch: async (): Promise<Partial<SnapshotQuote> | null> => {
          fetchState.calls += 1;
          if (fetchState.mode === 'fail') throw new Error('stub down');
          return { priceUsd: 2, priceChange24h: 0, totalSupply: 1_000 };
        },
      },
    ])
    .overrideProvider(LaunchpadDetectorService)
    .useValue({ detectLaunchpad: async () => null })
    .overrideProvider(DirectFastPathService)
    .useValue({ tryResolve: async () => null })
    .overrideProvider(ChainCatalogPort)
    .useValue({
      findById: async (id: string) => ({
        id: (id ?? '').trim().toLowerCase(),
        family: (id ?? '').trim().toLowerCase() === 'solana' ? 'SOLANA' : 'EVM',
        displayName: id,
        nativeSymbol: 'T',
        explorerUrl: null,
        geckoTerminalSlug: id,
        logoUrl: '',
      }),
      listAll: async () => [],
      listByFamily: async () => [],
    })
    .overrideProvider(DexScreenerService)
    .useValue({
      getBestPairSummary: async () => null,
      getBestPairSummaryForChain: async () => null,
    })
    .overrideProvider(GeckoTerminalService)
    .useValue({
      getTokenPools: async () => null,
      searchPools: async () => null,
      getPoolOhlcv: async () => null,
      getPoolOhlcvDay: async () => null,
    })
    .overrideProvider(BirdeyeService)
    .useValue({ getTokenOhlcv: async () => null })
    .overrideProvider(DevHoldingsPort)
    .useValue({ resolve: async () => null })
    .overrideProvider(AddressExistenceService)
    .useValue({
      probe: async (chain: string, address: string, kind: string) => {
        existence.calls.push({ chain, address, kind });
        return { verdict: existence.verdict, reason: existence.reason, ms: 1 };
      },
    })
    .compile();
  modules.push(module);
  return {
    snapshots: module.get(AddressSnapshotService),
    history: module.get(SnapshotHistoryRepository),
    aging: module.get(PendingAgingService),
    fetchState,
    existence,
  };
}

afterEach(async () => {
  if (originalAgingN === undefined) {
    delete process.env['SNAPSHOT_PENDING_AGING_N'];
  } else {
    process.env['SNAPSHOT_PENDING_AGING_N'] = originalAgingN;
  }
  if (originalAgingWindowMs === undefined) {
    delete process.env['SNAPSHOT_PENDING_AGING_WINDOW_MS'];
  } else {
    process.env['SNAPSHOT_PENDING_AGING_WINDOW_MS'] = originalAgingWindowMs;
  }
  jest.restoreAllMocks();
  while (modules.length > 0) {
    const module = modules.pop();
    if (module !== undefined) await module.close();
  }
});

describe('AddressSnapshotService pending aging (todo 21d acceptance)', () => {
  it('escalates the 3rd consecutive pending to a differentiated invalid', async () => {
    const h = await harness();

    const first = await h.snapshots.getSnapshot(input);
    const second = await h.snapshots.getSnapshot(input);
    const third = await h.snapshots.getSnapshot(input);

    expect(first.status).toBe('pending');
    expect(second.status).toBe('pending');
    expect(third.status).toBe('invalid');
    expect(third.providerErrors).toEqual({
      'stub-native': 'stub down',
      aging: agingEscalationNote(3, WINDOW_MS),
    });
    expect(third.sources).toEqual([]);
    expect(h.fetchState.calls).toBe(3);
    expect(h.aging.size()).toBe(1);

    const rows = await h.history.listRecent(50);
    expect(rows[rows.length - 1]?.status).toBe('invalid');
  });

  it('keeps the escalated entry — the 4th pending re-escalates with an updated count', async () => {
    const h = await harness();

    await h.snapshots.getSnapshot(input);
    await h.snapshots.getSnapshot(input);
    const third = await h.snapshots.getSnapshot(input);
    const fourth = await h.snapshots.getSnapshot(input);

    expect(third.providerErrors['aging']).toBe(
      agingEscalationNote(3, WINDOW_MS),
    );
    expect(fourth.status).toBe('invalid');
    expect(fourth.providerErrors['aging']).toBe(
      agingEscalationNote(4, WINDOW_MS),
    );
    expect(h.fetchState.calls).toBe(4);
    expect(h.aging.size()).toBe(1);
  });

  it('restarts the streak on a window gap (isolated pendings never escalate)', async () => {
    const h = await harness();
    const base = Date.now();
    const nowSpy = jest.spyOn(Date, 'now');

    nowSpy.mockReturnValue(base);
    expect((await h.snapshots.getSnapshot(input)).status).toBe('pending');
    nowSpy.mockReturnValue(base + 11 * 60_000); // > 10 min window -> reset
    expect((await h.snapshots.getSnapshot(input)).status).toBe('pending');
    nowSpy.mockReturnValue(base + 11 * 60_000 + 1_000); // count 2
    expect((await h.snapshots.getSnapshot(input)).status).toBe('pending');
    nowSpy.mockReturnValue(base + 11 * 60_000 + 2_000); // count 3 -> escalate
    const fourth = await h.snapshots.getSnapshot(input);

    expect(fourth.status).toBe('invalid');
    expect(fourth.providerErrors['aging']).toBe(
      agingEscalationNote(3, WINDOW_MS),
    );
    expect(h.fetchState.calls).toBe(4);
  });

  it('clears the streak on fresh data — a later pending starts over and can serve stale', async () => {
    const h = await harness();

    await h.snapshots.getSnapshot(input); // pending, count 1
    await h.snapshots.getSnapshot(input); // pending, count 2
    expect(h.aging.size()).toBe(1);

    h.fetchState.mode = 'ok';
    const ready = await h.snapshots.getSnapshot(input);
    expect(ready.status).toBe('ready');
    expect(ready.priceUsd).toBe(2);
    expect(h.aging.size()).toBe(0);

    h.fetchState.mode = 'fail';
    const stale = await h.snapshots.getSnapshot(input);
    expect(stale.status).toBe('ready');
    expect(stale.stale).toBe(true);
    expect(stale.priceUsd).toBe(2);
    // The stale floor serves BEFORE `record` — the streak stays clear
    // (and the row replayed is the fresh one, not a frozen pending).
    expect(h.aging.size()).toBe(0);
    expect(h.fetchState.calls).toBe(4);
  });

  it('clears the streak on a definitive existence verdict (dead address converges invalid)', async () => {
    const h = await harness();

    const first = await h.snapshots.getSnapshot(input);
    expect(first.status).toBe('pending');
    expect(h.aging.size()).toBe(1);

    h.existence.verdict = 'missing';
    h.existence.reason = 'no contract bytecode (eth_getCode returned empty)';
    const second = await h.snapshots.getSnapshot(input);

    expect(second.status).toBe('invalid');
    expect(second.providerErrors).toEqual({
      existence: 'no contract bytecode (eth_getCode returned empty)',
    });
    expect(h.aging.size()).toBe(0);
    expect(h.fetchState.calls).toBe(1);
  });

  it('honors the SNAPSHOT_PENDING_AGING_N override from the environment', async () => {
    process.env['SNAPSHOT_PENDING_AGING_N'] = '2';
    const h = await harness();

    expect(h.aging.escalationThreshold).toBe(2);
    await h.snapshots.getSnapshot(input); // pending, count 1
    const second = await h.snapshots.getSnapshot(input); // count 2 -> escalate

    expect(second.status).toBe('invalid');
    expect(second.providerErrors).toEqual({
      'stub-native': 'stub down',
      aging: agingEscalationNote(2, WINDOW_MS),
    });
    expect(h.fetchState.calls).toBe(2);
  });
});

describe('PendingAgingService (unit, todo 21d primitives)', () => {
  it('defaults, window boundary, per-kind keys, backwards clock, clear/size', () => {
    const aging = new PendingAgingService();
    expect(aging.escalationThreshold).toBe(3);
    expect(aging.escalationWindowMs).toBe(WINDOW_MS);

    const t0 = 1_000_000;
    // Exactly the window edge still continues the streak...
    expect(aging.record('k', 'token', t0)).toEqual({
      count: 1,
      escalated: false,
    });
    expect(aging.record('k', 'token', t0 + WINDOW_MS).count).toBe(2);
    // ...one ms past it resets.
    expect(aging.record('k', 'token', t0 + WINDOW_MS + WINDOW_MS + 1).count).toBe(1);

    // Per-kind keys are independent.
    expect(aging.record('k', 'wallet', t0 + WINDOW_MS + WINDOW_MS + 1).count).toBe(1);
    expect(aging.record('k', 'wallet', t0 + WINDOW_MS + WINDOW_MS + 2).count).toBe(2);

    // A clock going backwards never continues a streak.
    expect(aging.record('k2', 'token', t0).count).toBe(1);
    expect(aging.record('k2', 'token', t0 - 1).count).toBe(1);

    // Escalation triggers at N and KEEPS counting.
    const a = aging.record('k3', 'token', t0);
    const b = aging.record('k3', 'token', t0 + 1);
    const c = aging.record('k3', 'token', t0 + 2);
    const d = aging.record('k3', 'token', t0 + 3);
    expect(a.escalated).toBe(false);
    expect(b.escalated).toBe(false);
    expect(c).toEqual({ count: 3, escalated: true });
    expect(d).toEqual({ count: 4, escalated: true });

    // clear/size.
    const before = aging.size();
    expect(before).toBeGreaterThanOrEqual(4);
    aging.clear('k3', 'token');
    expect(aging.size()).toBe(before - 1);

    // Env overrides read once at construction; garbage falls back.
    process.env['SNAPSHOT_PENDING_AGING_N'] = '2';
    process.env['SNAPSHOT_PENDING_AGING_WINDOW_MS'] = '5000';
    const scoped = new PendingAgingService();
    expect(scoped.escalationThreshold).toBe(2);
    expect(scoped.escalationWindowMs).toBe(5000);
    expect(scoped.record('k', 'token', 100).count).toBe(1);
    expect(scoped.record('k', 'token', 100 + 5001).count).toBe(1);

    process.env['SNAPSHOT_PENDING_AGING_N'] = 'abc';
    const fallback = new PendingAgingService();
    expect(fallback.escalationThreshold).toBe(3);
  });
});
