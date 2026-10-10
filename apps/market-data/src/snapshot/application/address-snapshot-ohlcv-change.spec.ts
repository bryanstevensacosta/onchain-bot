import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import { DirectFastPathService } from './direct-fast-path.service';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { SNAPSHOT_QUOTE_PROVIDERS } from '../domain/snapshot-quote.types';
import {
  deriveChange24hFromOhlcv,
  type OhlcvCandle,
} from '../domain/snapshot-ohlcv-change';

/**
 * OHLC-derived 24h change (dexter plan todo 33).
 *
 * Viability (keyless, verified live 2026-10-10, 3 probes total):
 * `GET /networks/robinhood/pools/0x9269…ef60/ohlcv/hour` answers
 * HTTP 200 with `ohlcv_list: [ts, o, h, l, close, vol][]`, epoch
 * seconds, `aggregate=1`, trade-gated (no trade, no candle — the
 * 30-row window spans 2026-09-26→2026-10-06 with a 55h gap).
 *
 * OHLC rows below are the verbatim live capture
 * (`/tmp/ohlcv-stageveil.json`, saved to evidence); `NOW_PINNED`
 * pins wall-clock 1h after the newest candle so both window legs
 * anchor on real rows (past anchor lands EXACTLY on a row).
 */
const STAGEVEIL = '0xcf7f57cd2924d5c34758a3363b0fb237687f3597';
const POOL =
  '0x9269be45b3b5e1526db43b8b5be282ac97fde1214e8a7e0cf75362dad4eeef60';
const WETH = '0x0000000000000000000000000000000000000000';

const STAGEVEIL_OHLC: ReadonlyArray<OhlcvCandle> = [
  [
    1791295200, 3.47176492559144e-6, 3.49401173447136e-6, 3.47176492559144e-6,
    3.49401173447136e-6, 2.39966889059843,
  ],
  [
    1791097200, 3.47501822931939e-6, 3.47501822931939e-6, 3.47176492559144e-6,
    3.47176492559144e-6, 0.52469526887058,
  ],
  [
    1791093600, 3.46357404230946e-6, 3.47501822931939e-6, 3.46357404230946e-6,
    3.47501822931939e-6, 0.477739000057192,
  ],
  [
    1791057600, 3.46284694822877e-6, 3.46357404230946e-6, 3.46284694822877e-6,
    3.46357404230946e-6, 0.476168120072505,
  ],
  [
    1791028800, 3.4395979534213e-6, 3.46284694822877e-6, 3.4395979534213e-6,
    3.46284694822877e-6, 0.951941166699043,
  ],
  [
    1790982000, 3.48268550432202e-6, 3.48268550432202e-6, 3.43958912072227e-6,
    3.4395979534213e-6, 0.472879200918563,
  ],
  [
    1790874000, 3.52075247450024e-6, 3.52075247450024e-6, 3.48268550432202e-6,
    3.48268550432202e-6, 0.597972523818963,
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
    3.54826016919447e-6, 14.83490440575,
  ],
  [
    1790719200, 3.53678428808248e-6, 3.53831597583048e-6, 3.53678428808248e-6,
    3.53831597583048e-6, 0.162811812043151,
  ],
  [
    1790701200, 3.52190961911777e-6, 3.53678428808248e-6, 3.52190961911777e-6,
    3.53678428808248e-6, 1.10236281593371,
  ],
  [
    1790593200, 3.50889809006573e-6, 3.52190961911777e-6, 3.50889809006573e-6,
    3.52190961911777e-6, 1.89683950109356,
  ],
  [
    1790564400, 3.53891217795334e-6, 3.53891217795334e-6, 3.50889809006573e-6,
    3.50889809006573e-6, 1.58745714656269,
  ],
  [
    1790557200, 3.56393750176334e-6, 3.56393750176334e-6, 3.53891217795334e-6,
    3.53891217795334e-6, 0.0821031319136184,
  ],
  [
    1790542800, 3.57177502633608e-6, 3.57177502633608e-6, 3.56393750176334e-6,
    3.56393750176334e-6, 1.03490503976381,
  ],
  [
    1790539200, 4.26932829758822e-6, 4.26932829758822e-6, 3.57177502633608e-6,
    3.57177502633608e-6, 0.259376640394677,
  ],
  [
    1790524800, 4.60686162661981e-6, 4.60686162661981e-6, 3.66172577057543e-6,
    4.26932829758822e-6, 377.5110998766284,
  ],
  [
    1790499600, 4.571866549842e-6, 4.60686162661981e-6, 4.571866549842e-6,
    4.60686162661981e-6, 0.0659900537190477,
  ],
  [
    1790470800, 4.98502283364835e-6, 4.98502283364835e-6, 4.571866549842e-6,
    4.571866549842e-6, 145.29620622443034,
  ],
  [
    1790460000, 4.97444384048368e-6, 4.98502283364835e-6, 4.97444384048368e-6,
    4.98502283364835e-6, 1.51651642230892,
  ],
  [
    1790445600, 4.99647856860326e-6, 4.99647856860326e-6, 4.97444384048368e-6,
    4.97444384048368e-6, 2.807063154,
  ],
  [
    1790442000, 5.03511326446269e-6, 5.03511326446269e-6, 4.99647856860326e-6,
    4.99647856860326e-6, 17.37193651801004,
  ],
  [
    1790438400, 5.14783867471606e-6, 5.14783867471606e-6, 5.03511326446269e-6,
    5.03511326446269e-6, 2.55292443269672,
  ],
  [
    1790434800, 9.17917782423709e-6, 9.17917782423709e-6, 5.08639703087353e-6,
    5.14783867471606e-6, 1189.2735001900376,
  ],
  [
    1790431200, 9.94961262531449e-6, 9.94961262531449e-6, 9.17917782423709e-6,
    9.17917782423709e-6, 7.30899393832917,
  ],
  [
    1790427600, 1.02676752620287e-5, 1.02676752620287e-5, 9.47327704793066e-6,
    9.94961262531449e-6, 259.4664662097539,
  ],
  [
    1790424000, 1.03215493095523e-5, 1.03215493095523e-5, 1.02676752620287e-5,
    1.02676752620287e-5, 26.71588750286716,
  ],
];

/** 1h after the 1790794800 candle: now-leg 3h fresh, past anchor exact. */
const NOW_PINNED = 1790805600 * 1000;
/** now-leg close 3.56162825287956e-6 over past close 3.53831597583048e-6. */
const EXPECTED_CHANGE = 0.6589;

function stageveilPools() {
  return [
    {
      id: `robinhood_${POOL}`,
      type: 'pool',
      attributes: {
        address: POOL,
        base_token_price_usd: '0.000003471764926',
        quote_token_price_usd: '2692.72',
        fdv_usd: '3471.764926',
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

describe('deriveChange24hFromOhlcv (todo 33, real STAGEVEIL fixture)', () => {
  it('computes the exact 24h change on real candles', () => {
    expect(deriveChange24hFromOhlcv(STAGEVEIL_OHLC, NOW_PINNED)).toBeCloseTo(
      EXPECTED_CHANGE,
      3,
    );
  });

  it('55h gap inside the window resolves honest null (no extrapolation)', () => {
    // 1h after the newest candle: now-leg fresh, but the rows jump
    // 1791295200 -> 1791097200 (55h) with nothing near now-24h.
    expect(
      deriveChange24hFromOhlcv(STAGEVEIL_OHLC, 1791298800 * 1000),
    ).toBeNull();
  });

  it('stale now-leg resolves null (days-old close is not a now price)', () => {
    expect(
      deriveChange24hFromOhlcv(
        STAGEVEIL_OHLC,
        1791295200 * 1000 + 7 * 3600 * 1000,
      ),
    ).toBeNull();
  });

  it.each([null, undefined, [], [[1790805600, 1, 1, 1, 2, 3] as never]])(
    'insufficient input (%p) resolves null',
    (candles) => {
      expect(
        deriveChange24hFromOhlcv(
          candles as ReadonlyArray<OhlcvCandle> | null | undefined,
          NOW_PINNED,
        ),
      ).toBeNull();
    },
  );

  it('future candles never anchor either leg', () => {
    const future: ReadonlyArray<OhlcvCandle> = [
      [1790805600 + 86400, 1, 1, 1, 99, 1],
    ];
    expect(deriveChange24hFromOhlcv(future, NOW_PINNED)).toBeNull();
  });

  it('zero past close resolves null (never divides by zero)', () => {
    const rows: ReadonlyArray<OhlcvCandle> = [
      [1790805600 - 3600, 1, 1, 1, 5, 1],
      [1790805600 - 86400, 1, 1, 1, 0, 1],
    ];
    expect(deriveChange24hFromOhlcv(rows, NOW_PINNED)).toBeNull();
  });

  it('equidistant past anchors break toward the newer candle', () => {
    const target = NOW_PINNED / 1000 - 86400;
    const rows: ReadonlyArray<OhlcvCandle> = [
      [NOW_PINNED / 1000 - 3600, 1, 1, 1, 10, 1],
      [target - 3600, 1, 1, 1, 5, 1],
      [target + 3600, 1, 1, 1, 8, 1],
    ];
    // (10-8)/8*100 = 25, not (10-5)/5*100 = 100.
    expect(deriveChange24hFromOhlcv(rows, NOW_PINNED)).toBeCloseTo(25, 10);
  });
});

async function buildService(options: {
  readonly nativeChange: number | null;
  readonly bestPair?: unknown;
  readonly pools: unknown;
  readonly ohlcv: unknown;
  readonly poolsCalls?: string[];
  readonly ohlcvCalls?: Array<[string, string, string]>;
}): Promise<AddressSnapshotService> {
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
        supportsChains: ['robinhood'],
        fetch: async () =>
          options.nativeChange === null
            ? null
            : { priceUsd: 0.0000035, priceChange24h: options.nativeChange },
      },
    ])
    .overrideProvider(LaunchpadDetectorService)
    .useValue({ detectLaunchpad: async () => null })
    .overrideProvider(DexScreenerService)
    .useValue({
      getBestPairSummaryForChain: async () => options.bestPair ?? null,
    })
    .overrideProvider(GeckoTerminalService)
    .useValue({
      getTokenPools: async (slug: string) => {
        options.poolsCalls?.push(slug);
        if (options.pools instanceof Error) throw options.pools;
        return options.pools;
      },
      searchPools: async () => null,
      getPoolOhlcv: async (slug: string, pool: string, side: string) => {
        options.ohlcvCalls?.push([slug, pool, side]);
        if (options.ohlcv instanceof Error) throw options.ohlcv;
        return options.ohlcv;
      },
    })
    .overrideProvider(DirectFastPathService)
    .useValue({ tryResolve: async () => null })
    .compile();
  return module.get(AddressSnapshotService);
}

describe('AddressSnapshotService OHLC-derived change (todo 33)', () => {
  let nowSpy: jest.SpyInstance;
  afterEach(() => {
    nowSpy?.mockRestore();
  });

  it('native change wins: zero OHLC calls, value untouched', async () => {
    const poolsCalls: string[] = [];
    const ohlcvCalls: Array<[string, string, string]> = [];
    const service = await buildService({
      nativeChange: 5.5,
      // Dexscreener hit parks the venue leg too, so ANY pools call
      // would be the change leg's — there are none (precedence proof).
      bestPair: { dexId: 'uniswap', labels: ['v4'] },
      pools: stageveilPools(),
      ohlcv: STAGEVEIL_OHLC,
      poolsCalls,
      ohlcvCalls,
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.priceChange24h).toBe(5.5);
    expect(snapshot.sources).not.toContain('geckoterminal-ohlcv');
    expect(poolsCalls).toEqual([]);
    expect(ohlcvCalls).toEqual([]);
  });

  it('all natives null + sufficient OHLC fills the derived change', async () => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW_PINNED);
    const ohlcvCalls: Array<[string, string, string]> = [];
    const service = await buildService({
      nativeChange: null,
      pools: stageveilPools(),
      ohlcv: STAGEVEIL_OHLC,
      ohlcvCalls,
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.priceChange24h).toBeCloseTo(EXPECTED_CHANGE, 3);
    expect(snapshot.sources).toContain('geckoterminal-ohlcv');
    expect(ohlcvCalls).toEqual([['robinhood', POOL, 'base']]);
  });

  it.each([null, [], new Error('gecko down')])(
    'insufficient OHLC (%p) keeps change null, never crashes',
    async (ohlcv) => {
      nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW_PINNED);
      const service = await buildService({
        nativeChange: null,
        pools: stageveilPools(),
        ohlcv,
      });
      const snapshot = await service.getSnapshot({
        chain: 'robinhood',
        value: STAGEVEIL,
        kindHint: 'token',
      });
      expect(snapshot.priceChange24h).toBeNull();
      expect(snapshot.sources).not.toContain('geckoterminal-ohlcv');
    },
  );

  it('gecko chain gate: pool without an address never reaches OHLC', async () => {
    const ohlcvCalls: Array<[string, string, string]> = [];
    const pools = stageveilPools().map((pool) => ({
      ...pool,
      attributes: { ...pool.attributes, address: '' },
    }));
    const service = await buildService({
      nativeChange: null,
      pools,
      ohlcv: STAGEVEIL_OHLC,
      ohlcvCalls,
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.priceChange24h).toBeNull();
    expect(ohlcvCalls).toEqual([]);
  });
});
