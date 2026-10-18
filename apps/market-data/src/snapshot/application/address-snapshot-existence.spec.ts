import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from 'cache/cache.module';
import { CacheService } from 'cache/application/cache.service';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import { DirectFastPathService } from './direct-fast-path.service';
import { AddressExistenceService } from './address-existence.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { ChainCatalogPort } from 'chain/application/ports/chain-catalog.port';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { DevHoldingsPort } from 'holders/domain/holdings.port';
import {
  SNAPSHOT_QUOTE_FIELDS,
  SNAPSHOT_QUOTE_PROVIDERS,
  emptySnapshotQuote,
  type SnapshotQuote,
} from '../domain/snapshot-quote.types';

/**
 * Existence gate (dexter plan todo 21b): a definitively-dead address
 * answers a differentiated `invalid` card BEFORE any provider fan-out
 * (zero quota burn, sub-second, `providerErrors.existence` carries the
 * reason). Every non-`missing` verdict fails open into the normal
 * pipeline; the service-level kind gate only probes `token`/`unknown`
 * (hint precedence pinned elsewhere). All adapters stubbed — zero
 * network; the probe itself is a DI stub (the real service's transport
 * is pinned by `address-existence.service.spec.ts`).
 */
const CHAIN = 'robinhood';
const TOKEN = '0xAbCd000000000000000000000000000000000001';
const input = { chain: CHAIN, value: TOKEN, kindHint: 'token' as const };
const REASON_MISSING = 'no contract bytecode (eth_getCode returned empty)';

type FetcherMode = 'ok' | 'fail';

interface FetcherState {
  mode: FetcherMode;
  calls: number;
}

interface ExistenceState {
  /** Mutable: tests flip the verdict between calls (A5-style flows live in the aging suite). */
  verdict: 'exists' | 'missing' | 'unresolved';
  reason: string;
  /** When true the stub throws (service must fail open). */
  throws: boolean;
  readonly calls: Array<{ chain: string; address: string; kind: string }>;
}

interface Harness {
  readonly snapshots: AddressSnapshotService;
  readonly history: SnapshotHistoryRepository;
  readonly cache: CacheService;
  readonly fetchState: FetcherState;
  readonly existence: ExistenceState;
}

const modules: TestingModule[] = [];

async function harness(): Promise<Harness> {
  const fetchState: FetcherState = { mode: 'ok', calls: 0 };
  const existence: ExistenceState = {
    verdict: 'unresolved',
    reason: 'spec stub (fail-open)',
    throws: false,
    calls: [],
  };
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      CacheModule,
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
    // Hermetic dev tail (non-solana would otherwise add two
    // 'unsupported chain' notes — see the SWR suite's harness note).
    .overrideProvider(DevHoldingsPort)
    .useValue({ resolve: async () => null })
    .overrideProvider(AddressExistenceService)
    .useValue({
      probe: async (chain: string, address: string, kind: string) => {
        existence.calls.push({ chain, address, kind });
        if (existence.throws) throw new Error('probe boom');
        return { verdict: existence.verdict, reason: existence.reason, ms: 1 };
      },
    })
    .compile();
  modules.push(module);
  return {
    snapshots: module.get(AddressSnapshotService),
    history: module.get(SnapshotHistoryRepository),
    cache: module.get(CacheService),
    fetchState,
    existence,
  };
}

afterEach(async () => {
  jest.restoreAllMocks();
  while (modules.length > 0) {
    const module = modules.pop();
    if (module !== undefined) await module.close();
  }
});

describe('AddressSnapshotService existence gate (todo 21b acceptance)', () => {
  it('serves a differentiated invalid fast for a dead token — zero fan-out', async () => {
    const h = await harness();
    h.existence.verdict = 'missing';
    h.existence.reason = REASON_MISSING;

    const started = Date.now();
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(Date.now() - started).toBeLessThan(500);

    expect(snapshot.status).toBe('invalid');
    expect(snapshot.stale).toBe(false);
    expect(snapshot.staleAsOf).toBeNull();
    expect(snapshot.degraded).toBe(false);
    expect(snapshot.providerErrors).toEqual({ existence: REASON_MISSING });
    expect(snapshot.sources).toEqual([]);
    expect(snapshot.assetId).toBeNull();
    expect(snapshot.fdvAth).toBeNull();
    expect(snapshot.launchpad).toBeNull();
    expect(snapshot.venue).toBeNull();
    expect(snapshot.pairCreatedAt).toBeNull();
    for (const field of SNAPSHOT_QUOTE_FIELDS) {
      expect(snapshot[field]).toBeNull();
    }

    // The probe ran BEFORE the fan-out: zero fetcher calls.
    expect(h.existence.calls).toEqual([
      { chain: CHAIN, address: TOKEN, kind: 'token' },
    ]);
    expect(h.fetchState.calls).toBe(0);

    // Persisted like any definitive card: invalid row, all-null quote.
    const rows = await h.history.listRecent(50);
    const last = rows[rows.length - 1];
    expect(last?.status).toBe('invalid');
    expect(last?.quote).toEqual(emptySnapshotQuote());
    expect(last?.sources).toEqual([]);
    expect(last?.providerErrors).toEqual({ existence: REASON_MISSING });
  });

  it('serves the repeat from cache — one probe, zero fetches, byte-identical card', async () => {
    const h = await harness();
    h.existence.verdict = 'missing';
    h.existence.reason = REASON_MISSING;

    const first = await h.snapshots.getSnapshot(input);
    const second = await h.snapshots.getSnapshot(input);

    expect(first.status).toBe('invalid');
    expect(second).toEqual(first);
    expect(h.existence.calls).toHaveLength(1);
    expect(h.fetchState.calls).toBe(0);
  });

  it('fails open on an unresolved verdict — the pipeline runs unchanged', async () => {
    const h = await harness();
    // Default stub verdict is 'unresolved'.

    const snapshot = await h.snapshots.getSnapshot(input);

    expect(snapshot.status).toBe('ready');
    expect(snapshot.priceUsd).toBe(2);
    expect(snapshot.sources).toEqual(['stub-native']);
    expect(snapshot.providerErrors).toEqual({});
    expect(snapshot.providerErrors['existence']).toBeUndefined();
    expect(h.existence.calls).toHaveLength(1);
    expect(h.fetchState.calls).toBe(1);
  });

  it('fails open when the probe itself throws — no existence note leaks', async () => {
    const h = await harness();
    h.existence.throws = true;

    const snapshot = await h.snapshots.getSnapshot(input);

    expect(snapshot.status).toBe('ready');
    expect(snapshot.providerErrors).toEqual({});
    expect(snapshot.providerErrors['existence']).toBeUndefined();
    expect(h.existence.calls).toHaveLength(1);
    expect(h.fetchState.calls).toBe(1);
  });

  it('never probes non-token/unknown kinds (wallet hint skips the gate)', async () => {
    const h = await harness();

    const snapshot = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: TOKEN,
      kindHint: 'wallet' as const,
    });

    expect(snapshot.kind).toBe('wallet');
    expect(snapshot.status).toBe('ready');
    expect(h.existence.calls).toHaveLength(0);
    expect(h.fetchState.calls).toBe(1);
  });

  it('passes an exists verdict through — probe result never blocks a live token', async () => {
    const h = await harness();
    h.existence.verdict = 'exists';
    h.existence.reason = 'contract bytecode present';

    const snapshot = await h.snapshots.getSnapshot(input);

    expect(snapshot.status).toBe('ready');
    expect(snapshot.priceUsd).toBe(2);
    expect(snapshot.providerErrors['existence']).toBeUndefined();
    expect(h.existence.calls).toHaveLength(1);
    expect(h.fetchState.calls).toBe(1);
  });

  it('probes an unhinted address as unknown kind and escalates a dead ask to invalid', async () => {
    const h = await harness();
    h.existence.verdict = 'missing';
    h.existence.reason = REASON_MISSING;

    const snapshot = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: TOKEN,
    });

    expect(snapshot.kind).toBe('unknown');
    expect(snapshot.status).toBe('invalid');
    expect(snapshot.providerErrors).toEqual({ existence: REASON_MISSING });
    expect(h.existence.calls).toEqual([
      { chain: CHAIN, address: TOKEN, kind: 'unknown' },
    ]);
    expect(h.fetchState.calls).toBe(0);

    const rows = await h.history.listRecent(50);
    expect(rows[rows.length - 1]?.kind).toBe('unknown');
  });
});
