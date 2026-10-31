import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from 'cache/cache.module';
import { SnapshotModule } from '../snapshot.module';
import {
  AddressSnapshotService,
  SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS,
} from './address-snapshot.service';
import { DirectFastPathService } from './direct-fast-path.service';
import { AddressExistenceService } from './address-existence.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { ChainCatalogPort } from 'chain/application/ports/chain-catalog.port';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { DevHoldingsPort } from 'holders/domain/holdings.port';
import { OnchainSolanaReaderService } from 'provider/infrastructure/onchain/onchain-solana.reader';
import type { BondingCurveReading } from 'provider/infrastructure/onchain/onchain-solana.reader';
import {
  SNAPSHOT_QUOTE_PROVIDERS,
  emptySnapshotQuote,
  type SnapshotQuote,
} from '../domain/snapshot-quote.types';
import type { BondingCurveInfo } from '../domain/snapshot.types';
import { SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS_DEFAULT } from '../domain/snapshot-bonding-curve-replay';

/**
 * Persisted bonding curve on replays (`rick-compact-card` §10.16 replay
 * follow-up, 2026-10-30): the curve rides `snapshot_history.quote`
 * (jsonb — no migration) and SWR-now / the stale floor serve it back
 * verbatim while the ROW is inside
 * `SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS`; past the bound (or for a
 * legacy row without the key) the replay serves `null` → FULL card.
 * The background refresh recomputes the curve so the persisted value
 * tracks graduation.
 *
 * All adapters are stubbed — zero network.
 */
const CHAIN = 'solana';
const MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';
const input = { chain: CHAIN, value: MINT, kindHint: 'token' as const };
const key = `${CHAIN}:${MINT.toLowerCase()}`;
const SWR_AGE_MS = 60_000;
const OVER_BOUND_AGE_MS = SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS + 60_000;

const WIRE_CURVE: BondingCurveInfo = {
  onCurve: true,
  launchpadId: 'pump-fun',
  quoteSymbol: 'Bitcoin',
  quoteMint: 'HytpiyuR3sVXGB5UqoqrnThCPH2X1tWVm5neep3Dpump',
  progressPercent: 65.69,
};

const READING: BondingCurveReading = {
  poolAddress: '5sqQd6fn8FqNkRerAYcz2gewDd97JHe9fvGASwRqQiCC',
  onCurve: true,
  launchpadId: 'pump-fun',
  quoteSymbol: 'Bitcoin',
  quoteMint: 'HytpiyuR3sVXGB5UqoqrnThCPH2X1tWVm5neep3Dpump',
  progressPercent: 65.69,
};

type CurveMode = 'reading' | 'null' | 'absent';

interface HarnessOptions {
  readonly curve?: CurveMode;
  readonly mode?: 'ok' | 'fail';
  readonly existence?: 'unresolved' | 'missing';
}

interface Harness {
  readonly snapshots: AddressSnapshotService;
  readonly history: SnapshotHistoryRepository;
  readonly saveSpy: jest.SpyInstance;
  readonly curveCalls: () => number;
  readonly seedRow: (ageMs: number, quote: SnapshotQuote) => Promise<void>;
}

const modules: TestingModule[] = [];

function buildReader(options: HarnessOptions): {
  reader: Record<string, unknown>;
  curveCalls: () => number;
} {
  const calls = { count: 0 };
  const reader: Record<string, unknown> = {
    getPoolView: async () => null,
    getTokenBasics: async () => null,
  };
  const curve = options.curve ?? 'reading';
  if (curve !== 'absent') {
    reader['getPumpCurve'] = async () => {
      calls.count += 1;
      return curve === 'null' ? null : READING;
    };
  }
  return { reader, curveCalls: () => calls.count };
}

function quoteWithCurve(curve: BondingCurveInfo | null): SnapshotQuote {
  return {
    ...emptySnapshotQuote(),
    priceUsd: 1,
    fdvUsd: 1_000,
    fdvProvenance: 'computed',
    bondingCurve: curve,
  };
}

function legacyQuote(): SnapshotQuote {
  // A pre-change row: the persisted jsonb has NO `bondingCurve` key.
  const quote: SnapshotQuote = quoteWithCurve(null);
  delete (quote as { bondingCurve?: BondingCurveInfo | null }).bondingCurve;
  return quote;
}

async function harness(options: HarnessOptions = {}): Promise<Harness> {
  const { reader, curveCalls } = buildReader(options);
  const fetcher = {
    name: 'stub-native',
    supportsChains: [CHAIN, 'ethereum'],
    fetch: async (): Promise<Partial<SnapshotQuote> | null> => {
      if (options.mode === 'fail') throw new Error('stub down');
      return {
        priceUsd: 1,
        priceChange24h: 0,
        symbol: 'MINT',
        name: 'Mint',
      };
    },
  };
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      CacheModule,
      SnapshotModule,
    ],
  })
    .overrideProvider(SNAPSHOT_QUOTE_PROVIDERS)
    .useValue([fetcher])
    .overrideProvider(LaunchpadDetectorService)
    .useValue({ detectLaunchpad: async () => null })
    .overrideProvider(DirectFastPathService)
    .useValue({ tryResolve: async () => null })
    .overrideProvider(OnchainSolanaReaderService)
    .useValue(reader)
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
      probe: async () =>
        options.existence === 'missing'
          ? {
              verdict: 'missing',
              reason: 'no account for mint (getAccountInfo returned null)',
              ms: 1,
            }
          : {
              verdict: 'unresolved',
              reason: 'spec stub (fail-open)',
              ms: 1,
            },
    })
    .compile();
  modules.push(module);
  const history = module.get(SnapshotHistoryRepository);
  const saveSpy = jest.spyOn(history, 'save');
  return {
    snapshots: module.get(AddressSnapshotService),
    history,
    saveSpy,
    curveCalls,
    seedRow: async (ageMs: number, quote: SnapshotQuote) => {
      const saved = await history.saveSeeded({
        key,
        chain: CHAIN,
        address: MINT.toLowerCase(),
        kind: 'token',
        status: 'ready',
        quote,
        sources: ['stub-native'],
        providerErrors: {},
        createdAt: new Date(Date.now() - ageMs).toISOString(),
      });
      expect(saved).not.toBeNull();
    },
  };
}

afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  while (modules.length > 0) {
    const module = modules.pop();
    if (module !== undefined) await module.close();
  }
});

describe('persisted bondingCurve — write seam (§10.16 replay follow-up)', () => {
  it('a fresh fan-out serve persists quote.bondingCurve (jsonb key)', async () => {
    expect(SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS).toBe(
      SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS_DEFAULT,
    );
    const h = await harness({ curve: 'reading' });
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.bondingCurve).toEqual(WIRE_CURVE);
    expect(h.saveSpy).toHaveBeenCalledTimes(1);
    const payload = h.saveSpy.mock.calls[0][0] as {
      readonly quote: SnapshotQuote;
    };
    expect(payload.quote.bondingCurve).toEqual(WIRE_CURVE);
    const recent = await h.history.listRecent(1);
    expect(recent[0]?.quote.bondingCurve).toEqual(WIRE_CURVE);
  });

  it('the persisted key survives the same 30s cache entry (second serve)', async () => {
    const h = await harness({ curve: 'reading' });
    const first = await h.snapshots.getSnapshot(input);
    const second = await h.snapshots.getSnapshot(input);
    // Cache HIT: no second save, identical curve on both serves.
    expect(h.saveSpy).toHaveBeenCalledTimes(1);
    expect(first.bondingCurve).toEqual(WIRE_CURVE);
    expect(second.bondingCurve).toEqual(WIRE_CURVE);
  });
});

describe('persisted bondingCurve — SWR-now replay', () => {
  it('serves the persisted curve for a ~60s-old row (not re-read live)', async () => {
    // `curve: 'null'` proves the served value comes from the ROW: a
    // live read at serve time would answer null.
    const h = await harness({ curve: 'null' });
    await h.seedRow(SWR_AGE_MS, quoteWithCurve(WIRE_CURVE));
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.stale).toBe(true);
    expect(snapshot.providerErrors['swr-now']).toBeDefined();
    expect(snapshot.bondingCurve).toEqual(WIRE_CURVE);
    await h.snapshots.backgroundRefreshHandle();
  });

  it('serves null when the row is older than the replay bound', async () => {
    const h = await harness({ curve: 'reading' });
    await h.seedRow(OVER_BOUND_AGE_MS, quoteWithCurve(WIRE_CURVE));
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.stale).toBe(true);
    expect(snapshot.staleAgeMs).toBeGreaterThan(
      SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS,
    );
    expect(snapshot.bondingCurve).toBeNull();
    await h.snapshots.backgroundRefreshHandle();
  });

  it('serves null for a legacy row with no bondingCurve key (no throw)', async () => {
    const h = await harness({ curve: 'reading' });
    await h.seedRow(SWR_AGE_MS, legacyQuote());
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.stale).toBe(true);
    expect(snapshot.bondingCurve).toBeNull();
    await h.snapshots.backgroundRefreshHandle();
  });

  it('serves null when the persisted object fails the structural guard', async () => {
    const h = await harness({ curve: 'reading' });
    const corrupt = {
      ...WIRE_CURVE,
      onCurve: false,
    } as unknown as BondingCurveInfo;
    await h.seedRow(SWR_AGE_MS, quoteWithCurve(corrupt));
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.stale).toBe(true);
    expect(snapshot.bondingCurve).toBeNull();
    await h.snapshots.backgroundRefreshHandle();
  });
});

describe('persisted bondingCurve — stale-floor replay', () => {
  it('serves the persisted curve for a fresh-enough row', async () => {
    const h = await harness({ curve: 'null', mode: 'fail' });
    await h.seedRow(10_000, quoteWithCurve(WIRE_CURVE));
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.stale).toBe(true);
    expect(snapshot.staleAgeMs).toBeLessThan(
      SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS,
    );
    expect(snapshot.bondingCurve).toEqual(WIRE_CURVE);
  });

  it('serves null past the replay bound', async () => {
    const h = await harness({ curve: 'reading', mode: 'fail' });
    await h.seedRow(OVER_BOUND_AGE_MS, quoteWithCurve(WIRE_CURVE));
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.stale).toBe(true);
    expect(snapshot.bondingCurve).toBeNull();
  });

  it('never re-persists the replayed curve (no save on a stale serve)', async () => {
    const h = await harness({ curve: 'reading', mode: 'fail' });
    await h.seedRow(10_000, quoteWithCurve(WIRE_CURVE));
    await h.snapshots.getSnapshot(input);
    expect(h.saveSpy).not.toHaveBeenCalled();
  });
});

describe('persisted bondingCurve — background refresh', () => {
  it('recomputes the curve (one read) and persists it for the next replay', async () => {
    const h = await harness({ curve: 'reading' });
    // The SWR serve replays a legacy row (null); the refresh must
    // compute + persist the curve so the NEXT replay can render it.
    await h.seedRow(SWR_AGE_MS, legacyQuote());
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.bondingCurve).toBeNull();
    await h.snapshots.backgroundRefreshHandle();
    expect(h.curveCalls()).toBe(1);
    expect(h.saveSpy).toHaveBeenCalledTimes(1);
    const payload = h.saveSpy.mock.calls[0][0] as {
      readonly quote: SnapshotQuote;
    };
    expect(payload.quote.bondingCurve).toEqual(WIRE_CURVE);
    const recent = await h.history.listRecent(1);
    expect(recent[0]?.quote.bondingCurve).toEqual(WIRE_CURVE);
  });

  it('keeps the curve neutral when the refresh read misses (null)', async () => {
    const h = await harness({ curve: 'null' });
    await h.seedRow(SWR_AGE_MS, legacyQuote());
    await h.snapshots.getSnapshot(input);
    await h.snapshots.backgroundRefreshHandle();
    expect(h.curveCalls()).toBe(1);
    const payload = h.saveSpy.mock.calls[0][0] as {
      readonly quote: SnapshotQuote;
    };
    expect(payload.quote.bondingCurve).toBeNull();
  });
});

describe('bondingCurve — invalid card', () => {
  it('stays null unconditionally and reads no curve', async () => {
    const h = await harness({ curve: 'reading', existence: 'missing' });
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.status).toBe('invalid');
    expect(snapshot.bondingCurve).toBeNull();
    expect(h.curveCalls()).toBe(0);
  });
});
