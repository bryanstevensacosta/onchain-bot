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
  SNAPSHOT_QUOTE_PROVIDERS,
  emptySnapshotQuote,
  type SnapshotQuote,
} from '../domain/snapshot-quote.types';
import {
  SNAPSHOT_SWR_MIN_AGE_MS,
  swrNowNote,
} from '../domain/snapshot-latency';

/**
 * SWR-now serve (dexter plan todo 21a): a warm `ready` history row
 * within [numbers TTL, stale bound) serves IMMEDIATELY — the fan-out
 * runs in background, deduped via `SingleflightService` under the
 * separate `refresh:<cacheKey>` key, and a successful refresh warms the
 * cache. Fresh rows keep pure pipeline semantics; rows past the stale
 * bound never SWR; existence-invalid refreshes persist the invalid
 * card. All adapters stubbed — zero network.
 */
const CHAIN = 'robinhood';
const TOKEN = '0xAbCd000000000000000000000000000000000001';
const input = { chain: CHAIN, value: TOKEN, kindHint: 'token' as const };
const key = `${CHAIN}:${TOKEN.toLowerCase()}`;
const cacheKey = `snapshot:${CHAIN}:${TOKEN.toLowerCase()}:token`;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

type FetcherMode = 'ok' | 'fail' | 'hold' | 'hang';

interface FetcherState {
  mode: FetcherMode;
  calls: number;
  /** Resolvers of held fetches, in call order. */
  readonly releases: Array<() => void>;
}

interface ExistenceState {
  verdict: 'exists' | 'missing' | 'unresolved';
  reason: string;
  readonly calls: Array<{ chain: string; address: string; kind: string }>;
}

interface HarnessOptions {
  readonly mode?: FetcherMode;
  readonly existence?: { verdict: 'exists' | 'missing' | 'unresolved'; reason: string };
}

interface Harness {
  readonly snapshots: AddressSnapshotService;
  readonly history: SnapshotHistoryRepository;
  readonly cache: CacheService;
  readonly fetchState: FetcherState;
  readonly existence: ExistenceState;
  readonly seedWarm: (ageMs: number) => Promise<string>;
}

const modules: TestingModule[] = [];

function warmRowSpec(ageMs: number): {
  readonly row: Parameters<SnapshotHistoryRepository['saveSeeded']>[0];
  readonly createdAt: string;
} {
  const createdAt = new Date(Date.now() - ageMs).toISOString();
  return {
    createdAt,
    row: {
      key,
      chain: CHAIN,
      address: TOKEN,
      kind: 'token',
      status: 'ready' as const,
      quote: {
        ...emptySnapshotQuote(),
        priceUsd: 1,
        fdvUsd: 1_000,
        fdvProvenance: 'computed' as const,
      },
      sources: ['stub-native'],
      providerErrors: {},
      createdAt,
    },
  };
}

async function waitFor(cond: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!cond()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function harness(options: HarnessOptions = {}): Promise<Harness> {
  const fetchState: FetcherState = {
    mode: options.mode ?? 'ok',
    calls: 0,
    releases: [],
  };
  const existence: ExistenceState = {
    verdict: options.existence?.verdict ?? 'unresolved',
    reason: options.existence?.reason ?? 'spec stub (fail-open)',
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
          if (fetchState.mode === 'hang') {
            return new Promise<Partial<SnapshotQuote> | null>(() => {});
          }
          if (fetchState.mode === 'hold') {
            await new Promise<void>((resolve) => {
              fetchState.releases.push(resolve);
            });
          }
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
    // Hermetic dev tail: the real service answers non-solana with two
    // 'unsupported chain' error entries (never network, but noisy on
    // the card) — the stub keeps the robinhood card's providerErrors
    // pinned to what THIS suite asserts.
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
    cache: module.get(CacheService),
    fetchState,
    existence,
    seedWarm: async (ageMs: number) => {
      const warm = warmRowSpec(ageMs);
      const saved = await module
        .get(SnapshotHistoryRepository)
        .saveSeeded(warm.row);
      expect(saved).not.toBeNull();
      return warm.createdAt;
    },
  };
}

afterEach(async () => {
  jest.restoreAllMocks();
  while (modules.length > 0) {
    const module = modules.pop();
    if (module !== undefined) await module.close();
  }
});

describe('AddressSnapshotService SWR-now serve (todo 21a acceptance)', () => {
  it('serves the warm row immediately, refreshes in background and warms the cache', async () => {
    const h = await harness();
    const warmAt = await h.seedWarm(MINUTE_MS);
    const started = Date.now();
    const first = await h.snapshots.getSnapshot(input);
    expect(Date.now() - started).toBeLessThan(200);

    expect(first.status).toBe('ready');
    expect(first.stale).toBe(true);
    expect(first.staleAsOf).toBe(warmAt);
    expect(first.staleAgeMs).toBeGreaterThanOrEqual(MINUTE_MS);
    expect(first.priceUsd).toBe(1);
    // Live-only extras never ride an SWR serve.
    expect(first.launchpad).toBeNull();
    expect(first.venue).toBeNull();
    expect(first.pairCreatedAt).toBeNull();
    // ATH from existing history only (zero network, no seed).
    expect(first.fdvAth).toEqual({ fdvUsd: 1_000, at: warmAt });
    expect(first.sources).toEqual(['stub-native']);
    expect(first.providerErrors).toEqual({
      'swr-now': swrNowNote(first.staleAgeMs ?? 0),
    });

    // The refresh is in flight (deduped under `refresh:<cacheKey>`).
    const handle = h.snapshots.backgroundRefreshHandle();
    expect(handle).not.toBeNull();
    await handle;

    // The refresh persisted the newest ready row...
    const rows = await h.history.listRecent(50);
    expect(rows[rows.length - 1]?.quote.priceUsd).toBe(2);
    // ...and warmed the cache: the repeat is a fresh HIT, no new fetch.
    const second = await h.snapshots.getSnapshot(input);
    expect(second.status).toBe('ready');
    expect(second.stale).toBe(false);
    expect(second.priceUsd).toBe(2);
    expect(second.providerErrors).toEqual({});
    expect(h.fetchState.calls).toBe(1);
  });

  it('collapses a second SWR serve onto the in-flight refresh (singleflight dedupe)', async () => {
    const h = await harness({ mode: 'hold' });
    const warmAt = await h.seedWarm(MINUTE_MS);
    const first = await h.snapshots.getSnapshot(input);
    expect(first.stale).toBe(true);
    expect(first.staleAsOf).toBe(warmAt);

    // The refresh reached the held fetcher (one fan-out in flight).
    await waitFor(() => h.fetchState.releases.length === 1);
    const second = await h.snapshots.getSnapshot(input);
    expect(second.stale).toBe(true);
    expect(second.staleAsOf).toBe(warmAt);
    // SWR serves are never cached (the refresh warms it on success).
    expect(await h.cache.get(cacheKey)).toBeNull();
    // Dedupe: the second serve started NO second fan-out.
    expect(h.fetchState.calls).toBe(1);

    h.fetchState.releases.shift()?.();
    await h.snapshots.backgroundRefreshHandle();
    expect(h.fetchState.calls).toBe(1);
    const third = await h.snapshots.getSnapshot(input);
    expect(third.priceUsd).toBe(2);
    expect(third.stale).toBe(false);
    expect(await h.cache.get(cacheKey)).not.toBeNull();
  });

  it('keeps pure pipeline semantics for a row younger than the SWR window', async () => {
    const h = await harness();
    await h.seedWarm(Math.floor(SNAPSHOT_SWR_MIN_AGE_MS / 2));
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.stale).toBe(false);
    expect(snapshot.priceUsd).toBe(2);
    expect(snapshot.providerErrors['swr-now']).toBeUndefined();
    expect(h.fetchState.calls).toBe(1);
    expect(h.snapshots.backgroundRefreshHandle()).toBeNull();
  });

  it('never SWRs a row past the 24h stale bound (honest pending instead)', async () => {
    const h = await harness({ mode: 'fail' });
    await h.seedWarm(48 * HOUR_MS);
    const pending = await h.snapshots.getSnapshot(input);
    expect(pending.status).toBe('pending');
    expect(pending.priceUsd).toBeNull();
    expect(pending.stale).toBe(false);
    expect(pending.providerErrors['swr-now']).toBeUndefined();
    expect(pending.providerErrors['stub-native']).toBe('stub down');
    expect(h.fetchState.calls).toBe(1);
    expect(h.snapshots.backgroundRefreshHandle()).toBeNull();
  });

  it('serves SWR first on a warm row, then the refresh persists the existence-invalid card', async () => {
    const reason = 'no contract bytecode (eth_getCode returned empty)';
    const h = await harness({
      existence: { verdict: 'missing', reason },
    });
    await h.seedWarm(MINUTE_MS);

    const first = await h.snapshots.getSnapshot(input);
    // SWR wins over the existence gate — the warm row serves, the
    // probe rides the refresh.
    expect(first.status).toBe('ready');
    expect(first.priceUsd).toBe(1);
    expect(first.stale).toBe(true);

    await h.snapshots.backgroundRefreshHandle();
    expect(h.existence.calls).toHaveLength(1);
    expect(h.existence.calls[0]?.address).toBe(TOKEN);
    expect(h.fetchState.calls).toBe(0);
    const rows = await h.history.listRecent(50);
    const last = rows[rows.length - 1];
    expect(last?.status).toBe('invalid');
    expect(last?.sources).toEqual([]);
    expect(last?.providerErrors).toEqual({ existence: reason });

    // The invalid card is cached: the repeat is a HIT with the
    // differentiated reason and zero extra probe/fetch.
    const second = await h.snapshots.getSnapshot(input);
    expect(second.status).toBe('invalid');
    expect(second.providerErrors).toEqual({ existence: reason });
    expect(second.fdvAth).toBeNull();
    expect(h.existence.calls).toHaveLength(1);
    expect(h.fetchState.calls).toBe(0);
  });
});
