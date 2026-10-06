import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import { DirectFastPathService } from './direct-fast-path.service';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
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

function stageveilPools(dexId: string | null) {
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
  readonly poolsCalls?: string[];
  readonly dexscreenerThrows?: boolean;
}): Promise<AddressSnapshotService> {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      SnapshotModule,
    ],
  })
    .overrideProvider(SNAPSHOT_QUOTE_PROVIDERS)
    .useValue([{ name: 'stub', supportsChains: [], fetch: async () => null }])
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
      getTokenPools: async (slug: string) => {
        options.poolsCalls?.push(slug);
        if (options.pools instanceof Error) throw options.pools;
        return options.pools;
      },
    })
    .overrideProvider(DirectFastPathService)
    .useValue({ tryResolve: async () => null })
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

  it('dexscreener hit wins and the gecko leg never fires', async () => {
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
    expect(poolsCalls).toEqual([]);
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

describe('selectPoolQuote dexId (todo 26)', () => {
  it('carries the picked pool dex id through', () => {
    expect(selectPoolQuote(stageveilPools('pons-v2-dex'), STAGEVEIL)).toEqual({
      fdvUsd: expect.closeTo(3471.764926, 4),
      priceUsd: expect.closeTo(0.000003471764926, 12),
      dexId: 'pons-v2-dex',
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
});
