import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import { DirectFastPathService } from './direct-fast-path.service';
import { AddressExistenceService } from './address-existence.service';
import { GoplusService } from 'provider/infrastructure/goplus';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { SNAPSHOT_QUOTE_PROVIDERS } from '../domain/snapshot-quote.types';
import type { OhlcvCandle } from '../domain/snapshot-ohlcv-change';
import {
  buildOhlcvSeedRows,
  deriveOutrightVsLiveChange,
  OHLC_BACKFILL_SOURCE,
  OHLC_BACKFILL_SOURCE_BIRDEYE,
} from '../domain/snapshot-ohlcv-backfill';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import type { AddressKind } from 'address/domain/address-kind';

/**
 * OHLC backfill for the 24h window + ATH (dexter plan todo 46,
 * camino al 0% honesto).
 *
 * Rows below are VERBATIM from the live Gecko capture
 * (`.omo/evidence/task-fe-ohlc-change-ohlcv.json`, STAGEVEIL pool
 * `robinhood_0x9269…ef60`): a 9-row subset keeping the shapes that
 * matter — the 55h gap (1791295200 → 1791097200), one future row at
 * the pinned NOW_A (1790809200), the 5-row covered window, and one
 * below-window row (1790701200). The ticket's "IP: 23 velas" capture
 * is not on disk (only referenced in the plan line); this verbatim
 * subset pins the same math (newest-row ≈ 24h-ago anchor +
 * now-live price). Documented in the evidence log.
 */
const STAGEVEIL = '0xcf7f57cd2924d5c34758a3363b0fb237687f3597';
const POOL =
  '0x9269be45b3b5e1526db43b8b5be282ac97fde1214e8a7e0cf75362dad4eeef60';
const WETH = '0x0000000000000000000000000000000000000000';

const VERBATIM_OHLC: ReadonlyArray<OhlcvCandle> = [
  [
    1791295200, 3.47176492559144e-6, 3.49401173447136e-6, 3.47176492559144e-6,
    3.49401173447136e-6, 2.39966889059843,
  ],
  [
    1791097200, 3.47501822931939e-6, 3.47501822931939e-6, 3.47176492559144e-6,
    3.47176492559144e-6, 0.52469526887058,
  ],
  [
    1790809200, 3.56162825287956e-6, 3.56162825287956e-6, 3.52075247450024e-6,
    3.52075247450024e-6, 44.0803238121498,
  ],
  [
    1790794800, 3.58262635039264e-6, 3.58262635039264e-6, 3.56162825287956e-6,
    3.56162825287956e-6, 1.79834492139398,
  ],
  [
    1790784000, 3.56846989952734e-6, 3.58262635039264e-6, 3.56846989952734e-6,
    3.58262635039264e-6, 0.542763737415548,
  ],
  [
    1790780400, 3.54826016919447e-6, 3.56846989952734e-6, 3.54826016919447e-6,
    3.56846989952734e-6, 0.738194688831071,
  ],
  [
    1790776800, 3.53831597583048e-6, 3.54826016919447e-6, 3.53831597583048e-6,
    3.53831597583048e-6, 14.83490440575,
  ],
  [
    1790719200, 3.53678428808248e-6, 3.53831597583048e-6, 3.53678428808248e-6,
    3.53831597583048e-6, 0.162811812043151,
  ],
  [
    1790701200, 3.52190961911777e-6, 3.53678428808248e-6, 3.52190961911777e-6,
    3.53678428808248e-6, 1.10236281593371,
  ],
];

/** 1h after the 1790794800 candle: 5-row window covered, anchor exact. */
const NOW_A = 1790805600 * 1000;
/** 1h after the newest candle: 55h gap inside the window. */
const NOW_B = 1791298800 * 1000;
/** Live merged price for the outright leg (below the backfill max). */
const LIVE_PRICE = 3.5e-6;
const SUPPLY = 1_000_000_000;
/** (LIVE - 3.53831597583048e-6) / 3.53831597583048e-6 * 100. */
const EXPECTED_OUTRIGHT = -1.082887342233103;
/** Max seeded close (1790784000) x supply — ATH over backfill. */
const EXPECTED_BACKFILL_MAX_FDV = 3582.62635039264;

const CTX = {
  key: 'robinhood:0xcf7f57cd2924d5c34758a3363b0fb237687f3597',
  chain: 'robinhood',
  address: STAGEVEIL,
  kind: 'token' as AddressKind,
  totalSupply: SUPPLY,
  maxSupply: null,
};

describe('buildOhlcvSeedRows (todo 46, verbatim STAGEVEIL rows)', () => {
  it('seeds exactly the in-window closes with candle-time createdAt', () => {
    const rows = buildOhlcvSeedRows(VERBATIM_OHLC, CTX, NOW_A);
    expect(rows.map((row) => row.createdAt)).toEqual([
      '2026-09-29T22:00:00.000Z',
      '2026-09-30T14:00:00.000Z',
      '2026-09-30T15:00:00.000Z',
      '2026-09-30T16:00:00.000Z',
      '2026-09-30T19:00:00.000Z',
    ]);
    // createdAt is candle time, NOT now (NOW_A is 06:00Z).
    for (const row of rows) {
      expect(Date.parse(row.createdAt)).toBeLessThan(NOW_A);
    }
  });

  it('computes fdv as close x current supply with computed provenance', () => {
    const rows = buildOhlcvSeedRows(VERBATIM_OHLC, CTX, NOW_A);
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.quote.fdvProvenance).toBe('computed');
      expect(row.sources).toEqual([OHLC_BACKFILL_SOURCE]);
      expect(row.status).toBe('ready');
    }
    const max = rows.find(
      (row) => row.createdAt === '2026-09-30T16:00:00.000Z',
    );
    expect(max?.quote.priceUsd).toBeCloseTo(3.58262635039264e-6, 18);
    expect(max?.quote.fdvUsd).toBeCloseTo(EXPECTED_BACKFILL_MAX_FDV, 6);
    // Anchors only: everything else stays null.
    expect(max?.quote.priceChange24h).toBeNull();
    expect(max?.quote.marketCapUsd).toBeNull();
    expect(max?.quote.symbol).toBeNull();
  });

  it('still seeds the price anchor when supply is missing (fdv null)', () => {
    const rows = buildOhlcvSeedRows(
      VERBATIM_OHLC,
      { ...CTX, totalSupply: null, maxSupply: null },
      NOW_A,
    );
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.quote.priceUsd).toBeGreaterThan(0);
      expect(row.quote.fdvUsd).toBeNull();
      expect(row.quote.fdvProvenance).toBe('computed');
    }
  });

  it('skips insane closes that the fdv seam would null', () => {
    const insane: ReadonlyArray<OhlcvCandle> = [
      [1790794800, 1, 1, 1, 0, 1],
      [1790794800, 1, 1, 1, -2, 1],
      [1790794800, 1, 1, 1, 1e12, 1],
      [1790794800, 1, 1, 1, Number.NaN, 1],
    ];
    expect(buildOhlcvSeedRows(insane, CTX, NOW_A)).toEqual([]);
  });

  it.each([null, undefined, [], 'nope'])(
    'insufficient input (%p) seeds nothing',
    (candles) => {
      expect(
        buildOhlcvSeedRows(
          candles as ReadonlyArray<OhlcvCandle> | null | undefined,
          CTX,
          NOW_A,
        ),
      ).toEqual([]);
    },
  );

  it('dedupes identical candle timestamps (first wins)', () => {
    const doubled = [...VERBATIM_OHLC, ...VERBATIM_OHLC];
    const rows = buildOhlcvSeedRows(doubled, CTX, NOW_A);
    expect(rows).toHaveLength(5);
  });

  it('honours an explicit source tag (todo 55: birdeye-ohlcv never claims gecko)', () => {
    const rows = buildOhlcvSeedRows(
      VERBATIM_OHLC,
      { ...CTX, source: OHLC_BACKFILL_SOURCE_BIRDEYE },
      NOW_A,
    );
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.sources).toEqual([OHLC_BACKFILL_SOURCE_BIRDEYE]);
    }
  });
});

describe('deriveOutrightVsLiveChange (todo 46)', () => {
  it('computes the exact outright-vs-live percent', () => {
    expect(
      deriveOutrightVsLiveChange(3.53831597583048e-6, LIVE_PRICE),
    ).toBeCloseTo(EXPECTED_OUTRIGHT, 6);
  });

  it('an unchanged price is an honest zero (never N/A)', () => {
    expect(deriveOutrightVsLiveChange(3.5e-6, 3.5e-6)).toBe(0);
  });

  it.each([null, undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'gap on the anchor leg (%p) resolves null',
    (anchor) => {
      expect(deriveOutrightVsLiveChange(anchor, LIVE_PRICE)).toBeNull();
    },
  );

  it.each([null, undefined, 0, -1, Number.NaN])(
    'gap on the live leg (%p) resolves null',
    (live) => {
      expect(deriveOutrightVsLiveChange(3.53831597583048e-6, live)).toBeNull();
    },
  );
});

describe('SnapshotHistoryRepository.saveSeeded/findAnchorAt (todo 46)', () => {
  it('pins candle-time createdAt and never duplicates (memory)', async () => {
    const history = new SnapshotHistoryRepository();
    const rows = buildOhlcvSeedRows(VERBATIM_OHLC, CTX, NOW_A);
    for (const row of rows) {
      await history.saveSeeded(row);
    }
    expect(await history.count()).toBe(5);
    for (const row of rows) {
      await history.saveSeeded(row);
    }
    expect(await history.count()).toBe(5);
    const recent = await history.listRecent(10);
    const stamps = recent.map((row) => row.createdAt);
    expect(new Set(stamps).size).toBe(stamps.length);
  });

  it('rejects malformed createdAt without touching the store', async () => {
    const history = new SnapshotHistoryRepository();
    const rows = buildOhlcvSeedRows(VERBATIM_OHLC, CTX, NOW_A);
    await expect(
      history.saveSeeded({ ...rows[0], createdAt: 'not-a-date' }),
    ).resolves.toBeNull();
    expect(await history.count()).toBe(0);
  });

  it('passes candle time through on the store path; 23505 collides to null', async () => {
    const seen: Array<Record<string, unknown>> = [];
    let calls = 0;
    const store = {
      create: (input: Record<string, unknown>) => ({ ...input }),
      save: async (entity: Record<string, unknown>) => {
        calls += 1;
        seen.push(entity);
        if (calls > 1) {
          const collision = new Error(
            'duplicate key value violates unique constraint',
          ) as Error & { readonly code?: string };
          (collision as { code?: string }).code = '23505';
          throw collision;
        }
        return entity;
      },
      find: async () => [],
      count: async () => 0,
      createQueryBuilder: () => ({
        delete: () => ({ where: () => ({ execute: async () => ({}) }) }),
      }),
    };
    const history = new SnapshotHistoryRepository(store as unknown as never);
    const rows = buildOhlcvSeedRows(VERBATIM_OHLC, CTX, NOW_A);
    const first = await history.saveSeeded(rows[0]);
    expect(first?.createdAt).toBe('2026-09-29T22:00:00.000Z');
    expect(seen[0].createdAt).toBeInstanceOf(Date);
    expect((seen[0].createdAt as Date).toISOString()).toBe(
      '2026-09-29T22:00:00.000Z',
    );
    await expect(history.saveSeeded(rows[0])).resolves.toBeNull();
  });

  it('rethrows non-collision store errors (service fail-opens above)', async () => {
    const store = {
      create: (input: Record<string, unknown>) => ({ ...input }),
      save: async () => {
        throw new Error('connection down');
      },
      find: async () => [],
      count: async () => 0,
      createQueryBuilder: () => ({
        delete: () => ({ where: () => ({ execute: async () => ({}) }) }),
      }),
    };
    const history = new SnapshotHistoryRepository(store as unknown as never);
    const rows = buildOhlcvSeedRows(VERBATIM_OHLC, CTX, NOW_A);
    await expect(history.saveSeeded(rows[0])).rejects.toThrow(
      'connection down',
    );
  });

  it('finds the nearest anchor, ties toward newer, gaps to null', async () => {
    const history = new SnapshotHistoryRepository();
    const rows = buildOhlcvSeedRows(VERBATIM_OHLC, CTX, NOW_A);
    for (const row of rows) {
      await history.saveSeeded(row);
    }
    const target = NOW_A - 24 * 60 * 60 * 1000;
    const anchor = await history.findAnchorAt(
      'ROBINHOOD',
      ` ${STAGEVEIL.toUpperCase()} `,
      target,
      2 * 60 * 60 * 1000,
    );
    expect(anchor?.createdAt).toBe('2026-09-29T22:00:00.000Z');
    expect(anchor?.quote.priceUsd).toBeCloseTo(3.53831597583048e-6, 18);
    // 55h-gap target: nearest seeded row is 23h off — honest null.
    await expect(
      history.findAnchorAt(
        'robinhood',
        STAGEVEIL,
        NOW_B - 24 * 60 * 60 * 1000,
        2 * 60 * 60 * 1000,
      ),
    ).resolves.toBeNull();
  });

  it('findAnchorAt skips pendings and foreign tokens', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save({
      ...CTX,
      status: 'pending',
      quote: {
        ...buildOhlcvSeedRows(VERBATIM_OHLC, CTX, NOW_A)[0].quote,
      },
      sources: [],
      providerErrors: {},
    });
    await expect(
      history.findAnchorAt(
        'robinhood',
        STAGEVEIL,
        NOW_A - 24 * 60 * 60 * 1000,
        2 * 60 * 60 * 1000,
      ),
    ).resolves.toBeNull();
    await expect(
      history.findAnchorAt(
        'robinhood',
        STAGEVEIL,
        Number.NaN,
        2 * 60 * 60 * 1000,
      ),
    ).resolves.toBeNull();
  });

  it('findAnchorAt constrains the store query by chain+address', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const store = {
      create: (input: Record<string, unknown>) => ({ ...input }),
      save: async (input: Record<string, unknown>) => input,
      find: async (args: Record<string, unknown>) => {
        seen.push(args);
        return [
          {
            key: CTX.key,
            chain: 'robinhood',
            address: STAGEVEIL,
            kind: 'token',
            status: 'ready',
            quote: { priceUsd: 3.5e-6, fdvUsd: 3500 },
            sources: [OHLC_BACKFILL_SOURCE],
            providerErrors: {},
            createdAt: new Date('2026-09-29T22:00:00.000Z'),
          },
        ];
      },
      count: async () => 1,
      createQueryBuilder: () => ({
        delete: () => ({ where: () => ({ execute: async () => ({}) }) }),
      }),
    };
    const history = new SnapshotHistoryRepository(store as unknown as never);
    const anchor = await history.findAnchorAt(
      'robinhood',
      STAGEVEIL,
      NOW_A - 24 * 60 * 60 * 1000,
      2 * 60 * 60 * 1000,
    );
    expect(seen[0]).toMatchObject({
      where: { chain: 'robinhood', address: STAGEVEIL },
      order: { createdAt: 'ASC' },
    });
    expect(anchor?.quote.priceUsd).toBe(3.5e-6);
  });
});

function stageveilPools() {
  return [
    {
      id: `robinhood_${POOL}`,
      type: 'pool',
      attributes: {
        address: POOL,
        base_token_price_usd: '0.0000035',
        quote_token_price_usd: '2692.72',
        fdv_usd: '3500',
        reserve_in_usd: '5737.1871',
      },
      relationships: {
        base_token: { data: { id: `robinhood_${STAGEVEIL}`, type: 'token' } },
        quote_token: { data: { id: `robinhood_${WETH}`, type: 'token' } },
        dex: { data: { id: 'pons-v2-dex', type: 'dex' } },
      },
    },
  ];
}

async function buildService(options: {
  readonly nativeChange: number | null;
  readonly livePrice: number | null;
  readonly pools: unknown;
  readonly ohlcv: unknown;
  readonly ohlcvCalls?: Array<[string, string, string]>;
  /** Chain the stub-native fetcher supports (default robinhood). */
  readonly stubChain?: string;
  /** Stubbed keyed token-level OHLC rows (todo 55 fallback). */
  readonly tokenOhlcv?: unknown;
  readonly tokenOhlcvCalls?: Array<[string, string, string, number, number]>;
  /** Make the keyed fallback throw (fail-open path). */
  readonly tokenOhlcvThrows?: boolean;
}): Promise<{
  readonly service: AddressSnapshotService;
  readonly history: SnapshotHistoryRepository;
}> {
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
        supportsChains: [options.stubChain ?? 'robinhood'],
        fetch: async () =>
          options.nativeChange === null && options.livePrice === null
            ? null
            : {
                priceUsd: options.livePrice,
                priceChange24h: options.nativeChange,
                totalSupply: SUPPLY,
              },
      },
    ])
    .overrideProvider(LaunchpadDetectorService)
    .useValue({ detectLaunchpad: async () => null })
    .overrideProvider(DexScreenerService)
    .useValue({ getBestPairSummaryForChain: async () => null })
    .overrideProvider(GeckoTerminalService)
    .useValue({
      getTokenPools: async () => options.pools,
      searchPools: async () => null,
      getPoolOhlcv: async (slug: string, pool: string, side: string) => {
        options.ohlcvCalls?.push([slug, pool, side]);
        return options.ohlcv;
      },
    })
    // Keyed token-level OHLC fallback (todo 55): always stubbed so the
    // real adapter never runs inside this suite (no key, no network).
    .overrideProvider(BirdeyeService)
    .useValue({
      getTokenOhlcv: async (
        address: string,
        chain: string,
        type: string,
        from: number,
        to: number,
      ) => {
        options.tokenOhlcvCalls?.push([address, chain, type, from, to]);
        if (options.tokenOhlcvThrows === true) {
          throw new Error('keyed OHLC leg down');
        }
        return options.tokenOhlcv ?? null;
      },
    })
    .overrideProvider(DirectFastPathService)
    .useValue({ tryResolve: async () => null })
    // Hermetic existence gate (todo 21b): fail-open stub — no live RPC
    // tier walk inside this suite.
    .overrideProvider(AddressExistenceService)
    .useValue({
      probe: async () => ({
        verdict: 'unresolved',
        reason: 'spec stub (fail-open)',
        ms: 0,
      }),
    })
    // Hermetic honeypot leg (todo 71): bsc token snapshots in this
    // suite (stubChain) would otherwise reach the live GoPlus API.
    // Definitive absence = zero network, no field, no note.
    .overrideProvider(GoplusService)
    .useValue({
      getTokenSecurity: async () => ({ kind: 'definitive-absence' }),
    })
    .compile();
  const service = module.get(AddressSnapshotService);
  const history = module.get(SnapshotHistoryRepository);
  return { service, history };
}

describe('AddressSnapshotService OHLC backfill (todo 46)', () => {
  let nowSpy: jest.SpyInstance | undefined;
  afterEach(() => {
    nowSpy?.mockRestore();
    nowSpy = undefined;
  });

  it('first encounter seeds the window, derives outright-vs-live, ATH over backfill', async () => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW_A);
    const ohlcvCalls: Array<[string, string, string]> = [];
    const { service, history } = await buildService({
      nativeChange: null,
      livePrice: LIVE_PRICE,
      pools: stageveilPools(),
      ohlcv: VERBATIM_OHLC,
      ohlcvCalls,
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    // Outright (history anchor vs live) wins over the candle-pure math.
    expect(snapshot.priceChange24h).toBeCloseTo(EXPECTED_OUTRIGHT, 6);
    expect(snapshot.sources).toContain('geckoterminal-ohlcv');
    expect(ohlcvCalls).toEqual([['robinhood', POOL, 'base']]);
    // Seeded rows: candle-time createdAt, computed provenance.
    expect(await history.count()).toBe(6);
    // ATH reads backfill+live and exceeds the live FDV (honest max).
    expect(snapshot.fdvAth?.fdvUsd).toBeCloseTo(EXPECTED_BACKFILL_MAX_FDV, 6);
    expect(snapshot.fdvAth?.fdvUsd).toBeGreaterThan(snapshot.fdvUsd ?? 0);
    expect(snapshot.fdvAth?.at).toBe(new Date(1790784000 * 1000).toISOString());
  });

  it('second encounter inserts no duplicates (unique key+createdAt)', async () => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW_A);
    const { service, history } = await buildService({
      nativeChange: null,
      livePrice: LIVE_PRICE,
      pools: stageveilPools(),
      ohlcv: VERBATIM_OHLC,
    });
    const first = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    const countAfterFirst = await history.count();
    const second = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    const rows = await history.listRecent(50);
    // Seeded candle stamps appear exactly once (the live rows share
    // `save`, which stamps wall-clock now and never dedupes — the
    // seed's idempotency is the candle-time unique, asserted here).
    // Seeded rows never carry priceChange24h (anchors only — the
    // builder leaves it null), which tells them apart from the live
    // rows that inherit the same source tag when derivation fires.
    const seededStamps = rows
      .filter(
        (row) =>
          row.sources.includes('geckoterminal-ohlcv') &&
          row.quote.priceChange24h === null,
      )
      .map((row) => row.createdAt);
    expect(seededStamps).toHaveLength(5);
    expect(new Set(seededStamps).size).toBe(seededStamps.length);
    // Only the second live row is new — zero re-seeded rows.
    expect(await history.count()).toBe(countAfterFirst + 1);
    expect(second.priceChange24h).toBeCloseTo(EXPECTED_OUTRIGHT, 6);
    expect(second.fdvAth).toEqual(first.fdvAth);
  });

  it('native change wins: zero OHLC calls, zero seeded rows', async () => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW_A);
    const ohlcvCalls: Array<[string, string, string]> = [];
    const { service, history } = await buildService({
      nativeChange: 5.5,
      livePrice: LIVE_PRICE,
      pools: stageveilPools(),
      ohlcv: VERBATIM_OHLC,
      ohlcvCalls,
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.priceChange24h).toBe(5.5);
    expect(snapshot.sources).not.toContain('geckoterminal-ohlcv');
    expect(ohlcvCalls).toEqual([]);
    // Only the live row persists — the seed never fires.
    expect(await history.count()).toBe(1);
  });

  it('55h gap resolves honest null with exactly one seeded row', async () => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW_B);
    const { service, history } = await buildService({
      nativeChange: null,
      livePrice: LIVE_PRICE,
      pools: stageveilPools(),
      ohlcv: VERBATIM_OHLC,
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.priceChange24h).toBeNull();
    expect(snapshot.sources).not.toContain('geckoterminal-ohlcv');
    const rows = await history.listRecent(50);
    const seeded = rows.filter((row) =>
      row.sources.includes('geckoterminal-ohlcv'),
    );
    expect(seeded).toHaveLength(1);
    expect(seeded[0].createdAt).toBe(new Date(1791295200 * 1000).toISOString());
  });
});

/**
 * Keyed OHLC fallback (dexter plan todo 55): probe-verified live
 * 2026-10-17 (`.omo/evidence/task-fe-keyed-smokes.log`) — Birdeye
 * `/defi/v3/ohlcv` WENCAT bsc `type=1H` answers 18 hourly candles
 * covering the 24h window, while Gecko returns no pools for the class
 * (`{"data":[]}` — research 51). Candles below are a VERBATIM subset
 * of that probe (`unix_time` epoch seconds mapped to the tuple).
 */
const WENCAT = '0xB596fc1980BA251B25B1D4BED33CB0B91bc17777';
/** 1h20m after the newest probe candle: now-leg fresh, anchor = first candle. */
const WENCAT_NOW = 1792239600 * 1000;
const WENCAT_CANDLES: ReadonlyArray<OhlcvCandle> = [
  [
    1792152000, 0.000012107787152685499, 0.000013945530999805002,
    0.00001205082638452316, 0.000013945530999805002, 62792996.77303118,
  ],
  [
    1792155600, 0.000013945530999805002, 0.000014062961116487644,
    0.00001299725862644272, 0.00001299725862644272, 22844507.695657387,
  ],
  [
    1792162800, 0.000014714391005373771, 0.000014714391005373771,
    0.000013817128871776037, 0.00001470491427029855, 5673569.19080091,
  ],
  [
    1792180800, 0.000015831681834938673, 0.000015831681834938673,
    0.000013396989211001683, 0.000013396989211001683, 64045006.783277765,
  ],
  [
    1792224000, 0.00001348560572956229, 0.000056302474219735946,
    0.00001348560572956229, 0.00002778323859517848, 1294660632.3304346,
  ],
  [
    1792234800, 0.00001987106806930963, 0.00001989453755850527,
    0.000019515402173685134, 0.000019646778620411308, 7555047.119087909,
  ],
];
/** Close of the 1792152000 candle: the history anchor (nearest to 24h-ago). */
const WENCAT_PAST_CLOSE = 0.000013945530999805002;
/** Live merged price for the outright leg (newest probe close). */
const WENCAT_LIVE = 0.000019646778620411308;
/** Window the service must request: [now - 26h, now] in epoch seconds. */
const WENCAT_WINDOW_FROM = 1792239600 - 26 * 60 * 60;

describe('AddressSnapshotService keyed OHLC fallback (todo 55, WENCAT class)', () => {
  let nowSpy: jest.SpyInstance | undefined;
  afterEach(() => {
    nowSpy?.mockRestore();
    nowSpy = undefined;
  });

  it('no gecko pools escalates to the keyed token route; derives outright and seeds birdeye-ohlcv rows', async () => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(WENCAT_NOW);
    const ohlcvCalls: Array<[string, string, string]> = [];
    const tokenOhlcvCalls: Array<[string, string, string, number, number]> = [];
    const { service, history } = await buildService({
      nativeChange: null,
      livePrice: WENCAT_LIVE,
      pools: [],
      ohlcv: null,
      ohlcvCalls,
      stubChain: 'bsc',
      tokenOhlcv: WENCAT_CANDLES,
      tokenOhlcvCalls,
    });
    const snapshot = await service.getSnapshot({
      chain: 'bsc',
      value: WENCAT,
      kindHint: 'token',
    });
    const expected =
      ((WENCAT_LIVE - WENCAT_PAST_CLOSE) / WENCAT_PAST_CLOSE) * 100;
    expect(snapshot.priceChange24h).toBeCloseTo(expected, 6);
    expect(snapshot.sources).toContain('birdeye-ohlcv');
    expect(snapshot.sources).not.toContain('geckoterminal-ohlcv');
    // Gecko picked no pool: its pool-OHLCV route was never called.
    expect(ohlcvCalls).toEqual([]);
    // Keyed fallback requested exactly the 26h seed window at 1H.
    expect(tokenOhlcvCalls).toEqual([
      [WENCAT, 'bsc', '1H', WENCAT_WINDOW_FROM, 1792239600],
    ]);
    // Six seeded rows (source-tagged anchors) + one live row.
    expect(await history.count()).toBe(7);
    const rows = await history.listRecent(50);
    const seeded = rows.filter(
      (row) =>
        row.sources.includes('birdeye-ohlcv') &&
        row.quote.priceChange24h === null,
    );
    expect(seeded).toHaveLength(6);
    const expectedStamps = WENCAT_CANDLES.map((candle) =>
      new Date(candle[0] * 1000).toISOString(),
    ).sort();
    expect(seeded.map((row) => row.createdAt).sort()).toEqual(expectedStamps);
    // ATH reads backfill+live: the 1792224000 spike close x supply wins.
    expect(snapshot.fdvAth?.at).toBe(new Date(1792224000 * 1000).toISOString());
    expect(snapshot.fdvAth?.fdvUsd).toBeCloseTo(
      0.00002778323859517848 * SUPPLY,
      6,
    );
  });

  it('gecko candles win; the keyed route is never called', async () => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW_A);
    const tokenOhlcvCalls: Array<[string, string, string, number, number]> = [];
    const { service } = await buildService({
      nativeChange: null,
      livePrice: LIVE_PRICE,
      pools: stageveilPools(),
      ohlcv: VERBATIM_OHLC,
      tokenOhlcv: WENCAT_CANDLES,
      tokenOhlcvCalls,
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.priceChange24h).toBeCloseTo(EXPECTED_OUTRIGHT, 6);
    expect(snapshot.sources).toContain('geckoterminal-ohlcv');
    expect(snapshot.sources).not.toContain('birdeye-ohlcv');
    expect(tokenOhlcvCalls).toEqual([]);
  });

  it('keyed fallback miss keeps the pre-55 dead-end shape (null, no seeds, no source tag)', async () => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(WENCAT_NOW);
    const tokenOhlcvCalls: Array<[string, string, string, number, number]> = [];
    const { service, history } = await buildService({
      nativeChange: null,
      livePrice: WENCAT_LIVE,
      pools: [],
      ohlcv: null,
      stubChain: 'bsc',
      tokenOhlcv: null,
      tokenOhlcvCalls,
    });
    const snapshot = await service.getSnapshot({
      chain: 'bsc',
      value: WENCAT,
      kindHint: 'token',
    });
    expect(snapshot.priceChange24h).toBeNull();
    expect(snapshot.sources).not.toContain('birdeye-ohlcv');
    expect(snapshot.sources).not.toContain('geckoterminal-ohlcv');
    expect(tokenOhlcvCalls).toHaveLength(1);
    // Only the live row persists — the seed never fires.
    expect(await history.count()).toBe(1);
  });

  it('keyed fallback throw fails open to the same dead-end shape', async () => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(WENCAT_NOW);
    const { service, history } = await buildService({
      nativeChange: null,
      livePrice: WENCAT_LIVE,
      pools: [],
      ohlcv: null,
      stubChain: 'bsc',
      tokenOhlcvThrows: true,
    });
    const snapshot = await service.getSnapshot({
      chain: 'bsc',
      value: WENCAT,
      kindHint: 'token',
    });
    expect(snapshot.priceChange24h).toBeNull();
    expect(await history.count()).toBe(1);
  });
});
