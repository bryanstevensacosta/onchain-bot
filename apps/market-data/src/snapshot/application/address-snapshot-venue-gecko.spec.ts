import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import { DirectFastPathService } from './direct-fast-path.service';
import { AddressExistenceService } from './address-existence.service';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { selectPoolQuote } from 'provider/infrastructure/geckoterminal';
import { SNAPSHOT_QUOTE_PROVIDERS } from '../domain/snapshot-quote.types';

/**
 * Gecko→venue fallback (dexter plan todo 26): when DexScreener has no
 * pair for the token, `relationships.dex.data.id` on the GeckoTerminal
 * best pool feeds `snapshot.venue` verbatim (labels `[]`).
 *
 * Fixtures shaped from the live STAGEVEIL capture 2026-10-06:
 * `robinhood_0x9269…` pool carries `dex: { id: 'pons-v2-dex' }`
 * with the highest reserve.
 */
const STAGEVEIL = '0xcf7f57cd2924d5c34758a3363b0fb237687f3597';
const POOL =
  '0x9269be45b3b5e1526db43b8b5be282ac97fde1214e8a7e0cf75362dad4eeef60';
const WETH = '0x0000000000000000000000000000000000000000';

function stageveilPools(dexId: string | null, poolCreatedAt?: string) {
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
        ...(poolCreatedAt === undefined
          ? {}
          : { pool_created_at: poolCreatedAt }),
      },
      relationships: {
        base_token: { data: { id: `robinhood_${STAGEVEIL}`, type: 'token' } },
        quote_token: { data: { id: `robinhood_${WETH}`, type: 'token' } },
        ...(dexId === null
          ? {}
          : { dex: { data: { id: dexId, type: 'dex' } } }),
      },
    },
  ];
}

async function buildService(options: {
  readonly bestPair: unknown;
  readonly pools: unknown;
  /**
   * Per-call `getTokenPools` answers (call index): `'throw'` rejects
   * (Gecko 429/outage), `'hang'` never settles (venue tail timeout);
   * a missing index falls back to `options.pools`.
   */
  readonly poolsPerCall?: ReadonlyArray<unknown>;
  readonly poolsCalls?: string[];
  readonly ohlcvCalls?: string[];
  readonly birdeyeCalls?: string[];
  readonly dexscreenerThrows?: boolean;
  /**
   * Native change contributed by the stub quote fetcher. A non-null
   * value makes the OHLC derivation leg early-return BEFORE touching
   * `getTokenPools` — the only way to prove the venue leg's call count.
   */
  readonly nativeChange?: number;
}): Promise<AddressSnapshotService> {
  let poolsCallIndex = 0;
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      SnapshotModule,
    ],
  })
    .overrideProvider(SNAPSHOT_QUOTE_PROVIDERS)
    .useValue([
      {
        name: 'stub',
        supportsChains: ['robinhood'],
        fetch: async () =>
          options.nativeChange === undefined
            ? null
            : { priceChange24h: options.nativeChange },
      },
    ])
    .overrideProvider(LaunchpadDetectorService)
    .useValue({ detectLaunchpad: async () => null })
    .overrideProvider(DexScreenerService)
    .useValue({
      getBestPairSummaryForChain: async () => {
        if (options.dexscreenerThrows === true) {
          throw new Error('dexscreener down');
        }
        return options.bestPair === null ? null : options.bestPair;
      },
    })
    .overrideProvider(GeckoTerminalService)
    .useValue({
      getTokenPools: jest.fn(async (slug: string) => {
        options.poolsCalls?.push(slug);
        const step = options.poolsPerCall?.[poolsCallIndex];
        poolsCallIndex += 1;
        if (step === 'hang') return new Promise(() => {});
        if (step === 'throw') throw new Error('geckoterminal 429');
        if (options.pools instanceof Error) throw options.pools;
        return step === undefined ? options.pools : step;
      }),
      getPoolOhlcv: jest.fn(async (_slug: string, pool: string) => {
        options.ohlcvCalls?.push(pool);
        return null;
      }),
      getPoolOhlcvDay: jest.fn(async () => null),
    })
    .overrideProvider(BirdeyeService)
    .useValue({
      getTokenOhlcv: jest.fn(async (address: string) => {
        options.birdeyeCalls?.push(address);
        return null;
      }),
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
    .compile();
  return module.get(AddressSnapshotService);
}

describe('AddressSnapshotService venue Gecko fallback (todo 26)', () => {
  it('STAGEVEIL: dexscreener miss + gecko pons-v2-dex pool resolves a non-empty venue', async () => {
    const service = await buildService({
      bestPair: null,
      pools: stageveilPools('pons-v2-dex'),
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.venue).toEqual({ dexId: 'pons-v2-dex', labels: [] });
  });

  it('pairCreatedAt uses the ALREADY-picked pool (one getTokenPools, no OHLC/Birdeye)', async () => {
    const poolsCalls: string[] = [];
    const ohlcvCalls: string[] = [];
    const birdeyeCalls: string[] = [];
    const service = await buildService({
      bestPair: null,
      pools: stageveilPools('pons-v2-dex', '2026-10-14T14:30:02Z'),
      poolsCalls,
      ohlcvCalls,
      birdeyeCalls,
      // Native change present -> derivation early-returns, so the ONLY
      // `getTokenPools` possible is the venue leg itself.
      nativeChange: 0,
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.venue).toEqual({ dexId: 'pons-v2-dex', labels: [] });
    // KODA-class acceptance: GT `pool_created_at` → ISO Age source.
    expect(snapshot.pairCreatedAt).toBe('2026-10-14T14:30:02.000Z');
    expect(poolsCalls).toEqual(['robinhood']);
    expect(ohlcvCalls).toEqual([]);
    expect(birdeyeCalls).toEqual([]);
  });

  it('pool without pool_created_at keeps pairCreatedAt null (honest gap)', async () => {
    const service = await buildService({
      bestPair: null,
      pools: stageveilPools('pons-v2-dex'),
      nativeChange: 0,
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.venue).toEqual({ dexId: 'pons-v2-dex', labels: [] });
    expect(snapshot.pairCreatedAt).toBeNull();
  });

  it('pool-pick failure keeps pairCreatedAt null without throwing', async () => {
    const service = await buildService({
      bestPair: null,
      pools: new Error('gecko down'),
      nativeChange: 0,
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.venue).toBeNull();
    expect(snapshot.pairCreatedAt).toBeNull();
  });

  it('dexscreener hit wins and the gecko venue leg never fires', async () => {
    const poolsCalls: string[] = [];
    const service = await buildService({
      bestPair: { dexId: 'uniswap', labels: ['v4'] },
      pools: stageveilPools('pons-v2-dex'),
      poolsCalls,
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.venue).toEqual({ dexId: 'uniswap', labels: ['v4'] });
    // Todo 33 change-leg discovery shares `getTokenPools`: the venue
    // leg itself stays skipped (venue above proves it) — this call is
    // the change leg finding no native change to beat. The stub has no
    // `getPoolOhlcv`, so the leg degrades to null (fail-open).
    expect(poolsCalls).toEqual(['robinhood']);
    expect(snapshot.priceChange24h).toBeNull();
  });

  it('dexscreener throw still falls back to gecko (fail-open ordering)', async () => {
    const service = await buildService({
      bestPair: null,
      pools: stageveilPools('pons-v2-dex'),
      dexscreenerThrows: true,
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.venue).toEqual({ dexId: 'pons-v2-dex', labels: [] });
  });

  it('gecko pool without a dex relationship keeps venue null', async () => {
    const service = await buildService({
      bestPair: null,
      pools: stageveilPools(null),
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.venue).toBeNull();
  });

  it.each([null, [], new Error('gecko down')])(
    'gecko miss (%p) keeps venue null, never crashes',
    async (pools) => {
      const service = await buildService({ bestPair: null, pools });
      const snapshot = await service.getSnapshot({
        chain: 'robinhood',
        value: STAGEVEIL,
        kindHint: 'token',
      });
      expect(snapshot.venue).toBeNull();
    },
  );

  it('venue never feeds launchpad (separation holds on the fallback path)', async () => {
    const service = await buildService({
      bestPair: null,
      pools: stageveilPools('pons-v2-dex'),
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.launchpad).toBeNull();
  });
});

describe('venue fallback from the derivation pool (zero extra Gecko calls)', () => {
  /**
   * The OHLC-derivation leg ALREADY picks a pool (`selectPoolQuote`) and
   * pays for it; when the venue tail dies (Gecko 429/timeout) that pick
   * still names the venue. Precedence: a real tail venue always wins.
   */
  it('fills venue from the picked pool when the venue tail answers 429', async () => {
    const poolsCalls: string[] = [];
    const service = await buildService({
      bestPair: null,
      pools: null,
      // Call 1 = venue tail (429), call 2 = derivation pick.
      poolsPerCall: [
        'throw',
        stageveilPools('pancakeswap_v2', '2026-10-14T14:30:02Z'),
      ],
      poolsCalls,
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.venue).toEqual({
      dexId: 'pancakeswap_v2',
      labels: [],
    });
    // Pair creation still comes from the derivation pool.
    expect(snapshot.pairCreatedAt).toBe('2026-10-14T14:30:02.000Z');
    // The fallback adds ZERO calls: one per existing leg, nothing more.
    expect(poolsCalls).toEqual(['robinhood', 'robinhood']);
  });

  it('rewrites the tail timeout note when the fallback fills the venue', async () => {
    const service = await buildService({
      bestPair: null,
      pools: null,
      // Call 1 = venue tail hangs (budget timeout), call 2 = derivation.
      poolsPerCall: ['hang', stageveilPools('pancakeswap_v2')],
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.venue).toEqual({
      dexId: 'pancakeswap_v2',
      labels: [],
    });
    // Honesty: the note must not claim the field stayed null.
    expect(snapshot.providerErrors['tail:venue']).toContain(
      'venue filled from derivation pool',
    );
    expect(snapshot.providerErrors['tail:venue']).not.toContain(
      'degraded to null',
    );
  });

  it('never overwrites a real tail venue with the derivation pick', async () => {
    const service = await buildService({
      bestPair: { dexId: 'uniswap', labels: ['v4'] },
      pools: stageveilPools('pancakeswap_v2'),
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.venue).toEqual({ dexId: 'uniswap', labels: ['v4'] });
  });

  it('keeps venue null when neither leg names a dex', async () => {
    const service = await buildService({
      bestPair: null,
      pools: stageveilPools(null),
    });
    const snapshot = await service.getSnapshot({
      chain: 'robinhood',
      value: STAGEVEIL,
      kindHint: 'token',
    });
    expect(snapshot.venue).toBeNull();
  });
});

describe('selectPoolQuote dexId (todo 26)', () => {
  it('carries the picked pool dex id through', () => {
    expect(selectPoolQuote(stageveilPools('pons-v2-dex'), STAGEVEIL)).toEqual({
      fdvUsd: expect.closeTo(3471.764926, 4),
      priceUsd: expect.closeTo(0.000003471764926, 12),
      dexId: 'pons-v2-dex',
      poolAddress: POOL,
      side: 'base',
      liquidityUsd: expect.closeTo(5737.1871, 4),
      volume24hUsd: null,
      priceChange24h: null,
      volume1hUsd: null,
      priceChange1h: null,
      txns1hBuys: null,
      txns1hSells: null,
      poolCreatedAtMs: null,
    });
  });

  it('resolves null dexId when the pool carries no dex relationship', () => {
    const pick = selectPoolQuote(stageveilPools(null), STAGEVEIL);
    expect(pick?.dexId).toBeNull();
    expect(pick?.fdvUsd).toBeCloseTo(3471.764926, 4);
  });

  it('blank dex id resolves null dexId, never a blank venue', () => {
    const pick = selectPoolQuote(stageveilPools('   '), STAGEVEIL);
    expect(pick?.dexId).toBeNull();
  });

  it('carries pool_created_at as raw ms (rick-compact-card D1)', () => {
    const pick = selectPoolQuote(
      stageveilPools('pons-v2-dex', '2026-10-14T14:30:02Z'),
      STAGEVEIL,
    );
    expect(pick?.poolCreatedAtMs).toBe(Date.parse('2026-10-14T14:30:02Z'));
  });
});
