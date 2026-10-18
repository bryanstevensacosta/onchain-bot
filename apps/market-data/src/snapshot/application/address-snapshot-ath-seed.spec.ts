import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import { DirectFastPathService } from './direct-fast-path.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { ChainCatalogPort } from 'chain/application/ports/chain-catalog.port';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import {
  SNAPSHOT_QUOTE_PROVIDERS,
  emptySnapshotQuote,
} from '../domain/snapshot-quote.types';
import type { OhlcvCandle } from '../domain/snapshot-ohlcv-change';
import {
  ATH_SEED_SOURCE,
  AthSeedNegativeMemo,
  buildFdvAthSeedRow,
  resolveAthSeedDays,
  resolveAthSeedEnabled,
  SNAPSHOT_ATH_SEED_DAYS_DEFAULT,
  SNAPSHOT_ATH_SEED_DAYS_MAX,
  SNAPSHOT_ATH_SEED_TIMEOUT_MS,
} from '../domain/snapshot-ath-seed';

/**
 * One-shot historical FDV-ATH seed (dexter plan todo 68): acceptance
 * matrix. Keyless GT `ohlcv/day` -> ONE peak-candle row on first sight
 * (cold OR pre-existing), `fdvAth = max(high) x supply`, stamped
 * candle-open + 1ms, marker `geckoterminal-ath-seed` arming the
 * one-shot guard, negative memo for DEFINITIVE absences only,
 * kill-switch, and the fail-open total (429/401/404/[]/timeout ->
 * null, never a throw). All adapters stubbed — zero network.
 */
const CHAIN = 'robinhood';
const TOKEN = '0xAbCd000000000000000000000000000000000001';
const TOKEN_B = '0xBbbB000000000000000000000000000000000002';
const OTHER = '0xEeee000000000000000000000000000000000003';
const POOL = '0x9c7ec8b1a2f4de5c6b7a8091d2e3f4a5b6c7d8e9';
const POOL_B = '0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d';
const SUPPLY = 1_000;
const DAY_SEC = 86_400;
const HOUR_MS = 60 * 60 * 1000;

/** Captured once: candle stamps are relative to the real clock. */
const NOW_SEC = Math.floor(Date.now() / 1000);
const daysAgo = (days: number): number => NOW_SEC - days * DAY_SEC;
const candle = (tsSec: number, high: number): OhlcvCandle => [
  tsSec,
  high,
  high,
  high,
  high,
  1_000,
];
const seedIso = (tsSec: number): string =>
  new Date(tsSec * 1000 + 1).toISOString();

type DayStep = ReadonlyArray<OhlcvCandle> | null | 'hang' | 'throw';

interface DscSummaryOverrides {
  readonly pairAddress?: string | null;
  readonly baseAddress?: string;
  readonly quoteAddress?: string;
  readonly pairCreatedAt?: number | null;
}

function summaryFor(
  address: string,
  pool: string,
  overrides: DscSummaryOverrides = {},
): Record<string, unknown> {
  return {
    chainId: CHAIN,
    dexId: 'pons-v2-dex',
    labels: ['v2'],
    pairAddress:
      overrides.pairAddress === undefined ? pool : overrides.pairAddress,
    pairCreatedAt:
      overrides.pairCreatedAt === undefined
        ? 1_791_892_874_000
        : overrides.pairCreatedAt,
    baseToken: {
      address: overrides.baseAddress ?? address,
      name: 'Stub',
      symbol: 'STUB',
    },
    quoteToken: {
      address: overrides.quoteAddress ?? OTHER,
      name: 'Wrapped',
      symbol: 'W',
    },
  };
}

interface HarnessOptions {
  readonly chain?: string;
  readonly supply?: number | null;
  readonly maxSupply?: number | null;
  readonly livePrice?: number | null;
  /** Per-call day answers; mutate after building for retry/TTL cases. */
  readonly steps?: Array<DayStep>;
  /** Per-address DSC summary (default: provider-style base-side pool). */
  readonly summaryForAddress?: (
    address: string,
  ) => Record<string, unknown> | null;
}

interface Harness {
  readonly snapshots: AddressSnapshotService;
  readonly history: SnapshotHistoryRepository;
  readonly dayCalls: Array<{ slug: string; pool: string; side: string }>;
}

const modules: TestingModule[] = [];

async function harness(options: HarnessOptions = {}): Promise<Harness> {
  const chain = options.chain ?? CHAIN;
  const steps = options.steps ?? [];
  const dayCalls: Array<{ slug: string; pool: string; side: string }> = [];
  const livePrice = options.livePrice === undefined ? 2 : options.livePrice;
  const supply = options.supply === undefined ? SUPPLY : options.supply;
  const summaryByAddress =
    options.summaryForAddress ??
    ((address: string) => summaryFor(address, POOL));
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
        supportsChains: [chain],
        fetch: async () =>
          livePrice === null
            ? null
            : {
                priceUsd: livePrice,
                // Native change present -> the OHLC derivation leg stays
                // OFF: the ONLY Gecko calls here are the ATH seed's.
                priceChange24h: 0,
                totalSupply: supply,
                maxSupply: options.maxSupply ?? null,
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
      getBestPairSummary: async (_chain: string, address: string) =>
        summaryByAddress(address),
      getBestPairSummaryForChain: async (_chain: string, address: string) =>
        summaryByAddress(address),
    })
    .overrideProvider(GeckoTerminalService)
    .useValue({
      getTokenPools: async () => null,
      searchPools: async () => null,
      getPoolOhlcv: async () => null,
      getPoolOhlcvDay: async (
        slug: string,
        pool: string,
        side: 'base' | 'quote',
      ) => {
        dayCalls.push({ slug, pool, side });
        const step = steps[dayCalls.length - 1] ?? null;
        if (step === 'hang') return new Promise(() => {});
        if (step === 'throw') throw new Error('gt transient');
        return step;
      },
    })
    .overrideProvider(BirdeyeService)
    .useValue({ getTokenOhlcv: async () => null })
    .compile();
  modules.push(module);
  return {
    snapshots: module.get(AddressSnapshotService),
    history: module.get(SnapshotHistoryRepository),
    dayCalls,
  };
}

afterEach(async () => {
  jest.restoreAllMocks();
  while (modules.length > 0) {
    const module = modules.pop();
    if (module !== undefined) await module.close();
  }
});

describe('buildFdvAthSeedRow (pure seed builder, todo 68)', () => {
  const ctx = {
    key: `${CHAIN}:${TOKEN.toLowerCase()}`,
    chain: CHAIN,
    address: TOKEN,
    kind: 'token',
    totalSupply: SUPPLY,
    maxSupply: null,
    windowDays: SNAPSHOT_ATH_SEED_DAYS_DEFAULT,
  };

  it('seeds the peak HIGH as fdv = high x supply, stamped open + 1ms', () => {
    const rows = buildFdvAthSeedRow(
      [candle(daysAgo(2), 6), candle(daysAgo(9), 3)],
      ctx,
      Date.now(),
    );
    expect(rows).toMatchObject({
      key: ctx.key,
      chain: CHAIN,
      address: TOKEN,
      kind: 'token',
      status: 'ready',
      sources: [ATH_SEED_SOURCE],
      providerErrors: {},
      createdAt: seedIso(daysAgo(2)),
    });
    expect(rows?.quote.priceUsd).toBe(6);
    expect(rows?.quote.fdvUsd).toBe(6 * SUPPLY);
    expect(rows?.quote.fdvProvenance).toBe('computed');
  });

  it('ties break toward the NEWER candle (GT newest-first input)', () => {
    const row = buildFdvAthSeedRow(
      [candle(daysAgo(2), 6), candle(daysAgo(8), 6)],
      ctx,
      Date.now(),
    );
    expect(row?.createdAt).toBe(seedIso(daysAgo(2)));
  });

  it('skips peaks older than the window, future/insane highs and malformed rows', () => {
    const row = buildFdvAthSeedRow(
      [
        candle(daysAgo(120), 900), // outside the 90d retention window
        [daysAgo(12), 1, 1e13, 1, 1, 1], // insane high
        [NOW_SEC + DAY_SEC, 1, 50, 1, 1, 1], // future candle
        [daysAgo(4), 1, Number.NaN, 1, 1, 1], // non-finite high
        'garbage',
        candle(daysAgo(10), 5),
      ],
      ctx,
      Date.now(),
    );
    expect(row?.quote.fdvUsd).toBe(5 * SUPPLY);
    expect(row?.createdAt).toBe(seedIso(daysAgo(10)));
  });

  it('resolves supply as total ?? max, and answers null when unusable', () => {
    const withMax = buildFdvAthSeedRow(
      [candle(daysAgo(3), 4)],
      { ...ctx, totalSupply: null, maxSupply: 2_000 },
      Date.now(),
    );
    expect(withMax?.quote.fdvUsd).toBe(4 * 2_000);
    for (const supply of [null, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        buildFdvAthSeedRow(
          [candle(daysAgo(3), 4)],
          { ...ctx, totalSupply: supply, maxSupply: null },
          Date.now(),
        ),
      ).toBeNull();
    }
    expect(buildFdvAthSeedRow([], ctx, Date.now())).toBeNull();
    expect(buildFdvAthSeedRow(null, ctx, Date.now())).toBeNull();
  });

  it('honors the windowDays override (30d window skips a 40d peak)', () => {
    const row = buildFdvAthSeedRow(
      [candle(daysAgo(40), 900), candle(daysAgo(10), 5)],
      { ...ctx, windowDays: 30 },
      Date.now(),
    );
    expect(row?.quote.fdvUsd).toBe(5 * SUPPLY);
  });
});

describe('ATH-seed resolvers + negative memo (pinned numbers)', () => {
  it('kill-switch defaults ENABLED; only explicit false-ish tokens disable', () => {
    expect(resolveAthSeedEnabled(undefined)).toBe(true);
    expect(resolveAthSeedEnabled('')).toBe(true);
    expect(resolveAthSeedEnabled('  ')).toBe(true);
    expect(resolveAthSeedEnabled('1')).toBe(true);
    expect(resolveAthSeedEnabled('true')).toBe(true);
    expect(resolveAthSeedEnabled('anything')).toBe(true);
    for (const off of ['0', 'false', 'off', 'no', 'disabled', ' OFF ']) {
      expect(resolveAthSeedEnabled(off)).toBe(false);
    }
  });

  it('window defaults 90d, caps at 180d, garbage falls back to default', () => {
    expect(resolveAthSeedDays(undefined)).toBe(SNAPSHOT_ATH_SEED_DAYS_DEFAULT);
    expect(resolveAthSeedDays('30')).toBe(30);
    expect(resolveAthSeedDays('45.9')).toBe(45);
    expect(resolveAthSeedDays('999')).toBe(SNAPSHOT_ATH_SEED_DAYS_MAX);
    for (const bad of ['', 'abc', '0', '-5', 'NaN']) {
      expect(resolveAthSeedDays(bad)).toBe(SNAPSHOT_ATH_SEED_DAYS_DEFAULT);
    }
  });

  it('memo expires lazily at the TTL, refreshes order, evicts on cap', () => {
    const memo = new AthSeedNegativeMemo(1_000, 2);
    expect(memo.has('a', 0)).toBe(false);
    memo.remember('a', 0);
    expect(memo.has('a', 999)).toBe(true);
    // Boundary: expiry is inclusive (expiresAt <= now -> gone).
    expect(memo.has('a', 1_000)).toBe(false);
    memo.remember('a', 0);
    memo.remember('b', 0);
    memo.remember('a', 0); // refresh -> 'b' is now oldest
    memo.remember('c', 0); // cap 2 -> evicts 'b'
    expect(memo.has('a', 0)).toBe(true);
    expect(memo.has('c', 0)).toBe(true);
    expect(memo.has('b', 0)).toBe(false);
  });
});

describe('AddressSnapshotService one-shot ATH seed (todo 68 acceptance)', () => {
  const input = { chain: CHAIN, value: TOKEN, kindHint: 'token' as const };
  const key = `${CHAIN}:${TOKEN.toLowerCase()}`;
  const peak = daysAgo(5);
  const series: Array<DayStep> = [[candle(peak, 6), candle(daysAgo(9), 3)]];

  it('seeds on first sight: peak day candle serves fdvAth in the SAME response', async () => {
    const h = await harness({ steps: series });
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.fdvAth).toEqual({
      fdvUsd: 6 * SUPPLY,
      at: seedIso(peak),
    });
    expect(h.dayCalls).toEqual([
      { slug: 'robinhood', pool: POOL, side: 'base' },
    ]);
    const lookup = await h.history.findFdvAth(CHAIN, TOKEN);
    expect(lookup.seeded).toBe(true);
    expect(lookup.ath).toEqual({ fdvUsd: 6 * SUPPLY, at: seedIso(peak) });
  });

  it('is one-shot per token: the second request pays ZERO day calls', async () => {
    const h = await harness({ steps: series });
    const first = await h.snapshots.getSnapshot(input);
    const second = await h.snapshots.getSnapshot(input);
    expect(h.dayCalls).toHaveLength(1);
    expect(second.fdvAth).toEqual(first.fdvAth);
  });

  it('definitive absence (empty series) memoizes: re-fires only after the TTL', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.now());
    const steps: Array<DayStep> = [null];
    const h = await harness({ steps });
    const first = await h.snapshots.getSnapshot(input);
    expect(first.fdvAth).toBeNull();
    expect(h.dayCalls).toHaveLength(1);
    await h.snapshots.getSnapshot(input);
    expect(h.dayCalls).toHaveLength(1); // memoized for 6h
    nowSpy.mockReturnValue(Date.now() + 6 * HOUR_MS + 1);
    await h.snapshots.getSnapshot(input);
    expect(h.dayCalls).toHaveLength(2); // expired -> retried
    expect((await h.history.findFdvAth(CHAIN, TOKEN)).seeded).toBe(false);
  });

  it('TRANSIENT failure (throw) fail-opens and is NEVER memoized', async () => {
    const steps: Array<DayStep> = ['throw'];
    const h = await harness({ steps });
    const first = await h.snapshots.getSnapshot(input);
    expect(first.status).toBe('ready');
    expect(first.fdvAth).toBeNull();
    expect(h.dayCalls).toHaveLength(1);
    await h.snapshots.getSnapshot(input);
    expect(h.dayCalls).toHaveLength(2); // retried, not memoized
  });

  it(`times out at ${SNAPSHOT_ATH_SEED_TIMEOUT_MS}ms fail-open, then retries next request`, async () => {
    const steps: Array<DayStep> = ['hang'];
    const h = await harness({ steps });
    const started = Date.now();
    const first = await h.snapshots.getSnapshot(input);
    // The abandoned socket never settles; the card resolved on the
    // pinned budget (fail-open) with no seed and no throw.
    expect(first.status).toBe('ready');
    expect(first.fdvAth).toBeNull();
    expect(h.dayCalls).toHaveLength(1);
    expect(Date.now() - started).toBeGreaterThanOrEqual(1_500);
    // Transient by definition: not memoized -> a working series seeds NOW.
    steps.push([candle(peak, 6)]);
    const second = await h.snapshots.getSnapshot(input);
    expect(h.dayCalls).toHaveLength(2);
    expect(second.fdvAth).toEqual({ fdvUsd: 6 * SUPPLY, at: seedIso(peak) });
  });

  it('zero calls when supply is unusable (no total, no max)', async () => {
    const h = await harness({ steps: series, supply: null, maxSupply: null });
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.fdvAth).toBeNull();
    expect(h.dayCalls).toHaveLength(0);
  });

  it('zero calls when there is no best pair (pairAddress null)', async () => {
    const h = await harness({
      steps: series,
      summaryForAddress: () => null,
    });
    await h.snapshots.getSnapshot(input);
    expect(h.dayCalls).toHaveLength(0);
  });

  it('zero calls when OUR side of the pair is unknown (pairSide null)', async () => {
    const h = await harness({
      steps: series,
      summaryForAddress: (address) =>
        summaryFor(address, POOL, { baseAddress: OTHER }),
    });
    await h.snapshots.getSnapshot(input);
    expect(h.dayCalls).toHaveLength(0);
  });

  it('zero calls for kind=wallet and for a Gecko-unsupported chain', async () => {
    const walletHarness = await harness({ steps: series });
    await walletHarness.snapshots.getSnapshot({
      chain: CHAIN,
      value: TOKEN,
      kindHint: 'wallet',
    });
    expect(walletHarness.dayCalls).toHaveLength(0);

    const chainHarness = await harness({ steps: series, chain: 'testchain' });
    await chainHarness.snapshots.getSnapshot({
      chain: 'testchain',
      value: TOKEN,
      kindHint: 'token',
    });
    expect(chainHarness.dayCalls).toHaveLength(0);
  });

  it('clamps ATH to the in-flight FDV when the live peak beats the seed', async () => {
    const before = new Date().toISOString();
    const h = await harness({ steps: series, livePrice: 8 });
    const snapshot = await h.snapshots.getSnapshot(input);
    // 8 x 1000 live vs 6 x 1000 seeded: never displays a receding ATH.
    expect(snapshot.fdvAth?.fdvUsd).toBe(8 * SUPPLY);
    expect(snapshot.fdvAth?.at).not.toBe(seedIso(peak));
    const atMs = Date.parse(snapshot.fdvAth?.at ?? '');
    expect(atMs).toBeGreaterThanOrEqual(Date.parse(before));
    // Max-only: the persisted live row dominates history; nothing lowered.
    const lookup = await h.history.findFdvAth(CHAIN, TOKEN);
    expect(lookup.seeded).toBe(true);
    expect(lookup.ath?.fdvUsd).toBe(8 * SUPPLY);
  });

  it('never lowers an existing seed: a cheap live row leaves the ATH at the peak', async () => {
    const h = await harness({ steps: series, livePrice: 1 });
    await h.snapshots.getSnapshot(input);
    const second = await h.snapshots.getSnapshot(input);
    expect(second.fdvAth).toEqual({ fdvUsd: 6 * SUPPLY, at: seedIso(peak) });
  });

  it('midnight collision: the +1ms day row coexists with an hourly row at the same open', async () => {
    const h = await harness({ steps: series });
    // Todo-46 hour backfill row stamps the EXACT candle open (midnight).
    const saved = await h.history.saveSeeded({
      key,
      chain: CHAIN,
      address: TOKEN,
      kind: 'token',
      status: 'ready',
      quote: {
        ...emptySnapshotQuote(),
        priceUsd: 4,
        fdvUsd: 4_000,
        fdvProvenance: 'computed',
      },
      sources: ['geckoterminal-ohlcv'],
      providerErrors: {},
      createdAt: new Date(peak * 1000).toISOString(),
    });
    expect(saved).not.toBeNull();
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.fdvAth).toEqual({ fdvUsd: 6 * SUPPLY, at: seedIso(peak) });
    // Both rows survive (1ms apart) — seeded rows are NEVER deleted.
    const anchor = await h.history.findAnchorAt(
      CHAIN,
      TOKEN,
      peak * 1000,
      60_000,
    );
    expect(anchor?.sources).toEqual(['geckoterminal-ohlcv']);
    expect(anchor?.createdAt).toBe(new Date(peak * 1000).toISOString());
  });

  it('seeds the peak of EACH cold token independently (one call per token)', async () => {
    const poolB = POOL_B;
    const peakB = daysAgo(7);
    const h = await harness({
      steps: [[candle(peak, 6)], [candle(peakB, 9)]],
      summaryForAddress: (address) =>
        address.toLowerCase() === TOKEN_B.toLowerCase()
          ? summaryFor(TOKEN_B, poolB)
          : summaryFor(TOKEN, POOL),
    });
    const first = await h.snapshots.getSnapshot(input);
    const second = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: TOKEN_B,
      kindHint: 'token',
    });
    expect(h.dayCalls).toEqual([
      { slug: 'robinhood', pool: POOL, side: 'base' },
      { slug: 'robinhood', pool: poolB, side: 'base' },
    ]);
    expect(first.fdvAth).toEqual({ fdvUsd: 6 * SUPPLY, at: seedIso(peak) });
    expect(second.fdvAth).toEqual({ fdvUsd: 9 * SUPPLY, at: seedIso(peakB) });
  });

  it('seeded row participates in SWR/anchor reads like any ready sample', async () => {
    const recent = NOW_SEC - 2 * 3_600;
    const seedRowFor = (tsSec: number): Record<string, unknown> => ({
      key,
      chain: CHAIN,
      address: TOKEN,
      kind: 'token',
      status: 'ready',
      quote: {
        ...emptySnapshotQuote(),
        priceUsd: 6,
        fdvUsd: 6 * SUPPLY,
        fdvProvenance: 'computed',
      },
      sources: [ATH_SEED_SOURCE],
      providerErrors: {},
      createdAt: seedIso(tsSec),
    });

    // Service-level: providers all fail on a token whose ONLY row is the
    // seed (2h old, inside the 24h floor) -> stale replay of THAT row,
    // never an honest pending.
    const staleHarness = await harness({ livePrice: null });
    await staleHarness.history.saveSeeded(seedRowFor(recent) as never);
    const stale = await staleHarness.snapshots.getSnapshot(input);
    expect(staleHarness.dayCalls).toHaveLength(0); // marker armed: no re-fire
    expect(stale.stale).toBe(true);
    expect(stale.status).toBe('ready');
    expect(stale.staleAsOf).toBe(seedIso(recent));
    expect(stale.priceUsd).toBe(6);
    expect(stale.sources).toEqual([ATH_SEED_SOURCE]);
    expect(stale.fdvAth).toEqual({ fdvUsd: 6 * SUPPLY, at: seedIso(recent) });

    // Repository-level: the anchor-near-candle read lands on it and the
    // age binding is honest (a window narrower than the candle age
    // answers null — never a timeless row).
    expect(
      (
        await staleHarness.history.findAnchorAt(
          CHAIN,
          TOKEN,
          recent * 1000,
          HOUR_MS,
        )
      )?.sources,
    ).toEqual([ATH_SEED_SOURCE]);
    expect(
      await staleHarness.history.findLatestReady(key, 'token', HOUR_MS),
    ).toBeNull();
    expect(
      (await staleHarness.history.findLatestReady(key, 'token', 24 * HOUR_MS))
        ?.createdAt,
    ).toBe(seedIso(recent));

    // Beyond the 24h floor a day-old seed NEVER serves stale: pending.
    const oldHarness = await harness({ livePrice: null });
    await oldHarness.history.saveSeeded(seedRowFor(daysAgo(3)) as never);
    const pending = await oldHarness.snapshots.getSnapshot(input);
    expect(pending.stale).toBe(false);
    expect(pending.status).toBe('pending');
    expect(pending.fdvAth).toEqual({
      fdvUsd: 6 * SUPPLY,
      at: seedIso(daysAgo(3)),
    });
  });
});
