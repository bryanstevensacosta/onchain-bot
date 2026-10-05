import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import axios from 'axios';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import {
  DEXSCREENER_CONFIG,
  type DexScreenerConfig,
} from 'provider/infrastructure/dexscreener/dexscreener.config';
import {
  resolveDexScreenerSlug,
  DEXSCREENER_CHAIN_SLUGS,
} from 'provider/infrastructure/dexscreener/dexscreener.service';
import type { DexScreenerPair } from 'provider/infrastructure/dexscreener/dexscreener.types';
import { buildProviderQuoteFetchers } from 'provider/infrastructure/quote-fetchers/provider-quote.fetchers';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import { LaunchpadDetectorService } from 'provider/launchpad/application/launchpad-detector.service';
import { SNAPSHOT_QUOTE_PROVIDERS } from '../domain/snapshot-quote.types';

/**
 * Chain-honest snapshots (plan todo 18): explicit-chain requests
 * resolve market data ONLY from their own chain — never a sibling
 * chain's best pair. Bare/unknown-chain callers keep the legacy
 * cross-chain best-pair semantics (pinned below, untouched).
 */
const FF81 = '0xFf8104251E7761163faC3211eF5583FB3F8583d6';

function pair(
  overrides: Partial<DexScreenerPair> & { chainId: string },
): DexScreenerPair {
  return {
    dexId: 'baseline',
    url: `https://dexscreener.com/${overrides.chainId}/pair`,
    pairAddress: 'pair1',
    labels: [],
    baseToken: { address: FF81, name: 'REPPO', symbol: 'REPPO' },
    quoteToken: { address: null, name: null, symbol: null },
    priceNative: '0.01630',
    priceUsd: '0.01335',
    txns: { h24: { buys: 74, sells: 104 } },
    volume: { h24: 33208.37 },
    priceChange: { h24: 1.5 },
    liquidity: { usd: 759829.39, base: 1, quote: 1 },
    fdv: 1000000,
    marketCap: 900000,
    pairCreatedAt: null,
    ...overrides,
  };
}

async function realService(): Promise<DexScreenerService> {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
    providers: [
      DexScreenerService,
      { provide: DEXSCREENER_CONFIG, useValue: {} as DexScreenerConfig },
    ],
  }).compile();
  const service = module.get(DexScreenerService);
  return service;
}

describe('resolveDexScreenerSlug (chain-honest slug map)', () => {
  it.each([
    ['ethereum', 'ethereum'],
    ['solana', 'solana'],
    ['bsc', 'bsc'],
    ['base', 'base'],
    ['arbitrum', 'arbitrum'],
    ['polygon', 'polygon'],
  ])('maps our %s to DexScreener %s', (chain, slug) => {
    expect(resolveDexScreenerSlug(chain)).toBe(slug);
  });

  it.each([['robinhood'], ['unichain'], ['bnb'], [''], ['nope']])(
    'resolves null for unmapped %s (never a silent cross-chain fallback)',
    (chain) => {
      expect(resolveDexScreenerSlug(chain)).toBeNull();
    },
  );

  it('covers exactly the 6 catalog chains', () => {
    expect(Object.keys(DEXSCREENER_CHAIN_SLUGS).sort()).toEqual([
      'arbitrum',
      'base',
      'bsc',
      'ethereum',
      'polygon',
      'solana',
    ]);
  });
});

describe('DexScreenerService.getPairsByChain (bare-array shape)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('accepts the live bare-array shape (base 0xFf81: 14 pairs)', async () => {
    const service = await realService();
    const rows = Array.from({ length: 14 }, (_, i) =>
      pair({ chainId: 'base', pairAddress: `pair${i}` }),
    );
    jest.spyOn(axios, 'get').mockResolvedValue({ data: rows });
    await expect(service.getPairsByChain('base', FF81)).resolves.toHaveLength(
      14,
    );
  });

  it('accepts the honest empty array (ethereum 0xFf81: no pair)', async () => {
    const service = await realService();
    jest.spyOn(axios, 'get').mockResolvedValue({ data: [] });
    await expect(service.getPairsByChain('ethereum', FF81)).resolves.toEqual(
      [],
    );
  });

  it('still tolerates the legacy { pairs } envelope', async () => {
    const service = await realService();
    jest
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { pairs: [pair({ chainId: 'base' })] } });
    await expect(service.getPairsByChain('base', FF81)).resolves.toHaveLength(
      1,
    );
  });
});

describe('DexScreenerService.getBestPairSummaryForChain (strict mode)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('resolves the chain pair (base 0xFf81 fixture: baseline, liq 759829.39)', async () => {
    const service = await realService();
    jest
      .spyOn(service, 'getPairsByChain')
      .mockResolvedValue([pair({ chainId: 'base' })]);
    const summary = await service.getBestPairSummaryForChain('base', FF81);
    expect(summary?.dexId).toBe('baseline');
    expect(summary?.liquidityUsd).toBe(759829.39);
    expect(service.getPairsByChain).toHaveBeenCalledWith('base', FF81);
  });

  it('resolves null when the chain has no pair (ethereum 0xFf81: [])', async () => {
    const service = await realService();
    const spy = jest.spyOn(service, 'getPairsByChain').mockResolvedValue([]);
    await expect(
      service.getBestPairSummaryForChain('ethereum', FF81),
    ).resolves.toBeNull();
    expect(spy).toHaveBeenCalledWith('ethereum', FF81);
  });

  it('applies the STRICT same-chain filter (drops a richer foreign row)', async () => {
    const service = await realService();
    jest.spyOn(service, 'getPairsByChain').mockResolvedValue([
      pair({
        chainId: 'ethereum',
        liquidity: { usd: 99999999, base: 1, quote: 1 },
      }),
      pair({ chainId: 'base', liquidity: { usd: 100, base: 1, quote: 1 } }),
    ]);
    const summary = await service.getBestPairSummaryForChain('base', FF81);
    expect(summary?.liquidityUsd).toBe(100);
  });

  it('resolves null for an unmapped slug with ZERO network traffic', async () => {
    const service = await realService();
    const spy = jest.spyOn(service, 'getPairsByChain');
    await expect(
      service.getBestPairSummaryForChain('robinhood', FF81),
    ).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('DexScreenerService.getBestPairSummary (best-effort mode, untouched)', () => {
  it('keeps cross-chain best-pair semantics for bare callers', async () => {
    const service = await realService();
    jest.spyOn(service, 'getPairsByToken').mockResolvedValue([
      pair({
        chainId: 'base',
        liquidity: { usd: 759829.39, base: 1, quote: 1 },
      }),
      pair({
        chainId: 'ethereum',
        liquidity: { usd: 10, base: 1, quote: 1 },
      }),
    ]);
    const summary = await service.getBestPairSummary(FF81);
    expect(summary?.liquidityUsd).toBe(759829.39);
  });
});

describe('dexscreener quote fetcher (chain-honest regression)', () => {
  function stubDeps(
    perChain: Record<string, unknown>,
  ): Parameters<typeof buildProviderQuoteFetchers>[0] {
    return {
      dexscreener: {
        getBestPairSummaryForChain: async (chain: string) =>
          (perChain[chain] as never) ?? null,
      },
      geckoterminal: { getTokenInfo: async () => null },
      birdeye: { getTokenOverview: async () => null },
      ccxt: { defaultExchange: 'binance', fetchTicker: async () => null },
      coingecko: { getTokenContractInfo: async () => null },
      mobula: { getTokenMarkets: async () => null },
      moralis: {
        getTokenAnalytics: async () => null,
        getTokenHolders: async () => null,
      },
      rugcheck: { getSummary: async () => null },
      solanaRpc: {
        getTokenSupply: async () => null,
        getTokenLargestAccounts: async () => null,
      },
    } as unknown as Parameters<typeof buildProviderQuoteFetchers>[0];
  }

  it('same address x 3 chains -> data-or-null, never triplicated identical', async () => {
    const fetchers = buildProviderQuoteFetchers(
      stubDeps({
        base: {
          priceUsd: '0.01335',
          marketCap: 900000,
          fdv: 1000000,
          liquidityUsd: 759829.39,
          volume24h: 33208.37,
          priceChange24h: 1.5,
          baseToken: { address: FF81, symbol: 'REPPO', name: 'REPPO' },
          quoteToken: { address: null, symbol: null, name: null },
        },
      }),
    );
    const dex = fetchers.find((fetcher) => fetcher.name === 'dexscreener');
    expect(dex?.supportsChains).toEqual(
      expect.arrayContaining(['arbitrum', 'polygon']),
    );
    const base = await dex?.fetch('base', FF81);
    const eth = await dex?.fetch('ethereum', FF81);
    const bsc = await dex?.fetch('bsc', FF81);
    expect(base?.priceUsd).toBe(0.01335);
    expect(base?.liquidityUsd).toBe(759829.39);
    expect(eth).toBeNull();
    expect(bsc).toBeNull();
  });
});

describe('AddressSnapshotService venue (chain-honest, 0xFf81 fixture)', () => {
  const nullFetcher = {
    name: 'dexscreener',
    supportsChains: [
      'solana',
      'ethereum',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
    ],
    fetch: async () => null,
  };

  async function buildService(
    perChain: Record<string, unknown>,
  ): Promise<AddressSnapshotService> {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        SnapshotModule,
      ],
    })
      .overrideProvider(SNAPSHOT_QUOTE_PROVIDERS)
      .useValue([nullFetcher])
      .overrideProvider(LaunchpadDetectorService)
      .useValue({ detectLaunchpad: async () => null })
      .overrideProvider(DexScreenerService)
      .useValue({
        getBestPairSummary: async () => null,
        getBestPairSummaryForChain: async (chain: string) =>
          (perChain[chain] as never) ?? null,
      })
      .compile();
    return module.get(AddressSnapshotService);
  }

  it('base resolves the venue while eth/bsc resolve null (no triplication)', async () => {
    const service = await buildService({
      base: { dexId: 'baseline', labels: [] },
    });
    const base = await service.getSnapshot({
      chain: 'base',
      value: FF81,
      kindHint: 'token',
    });
    const eth = await service.getSnapshot({
      chain: 'ethereum',
      value: FF81,
      kindHint: 'token',
    });
    const bsc = await service.getSnapshot({
      chain: 'bsc',
      value: FF81,
      kindHint: 'token',
    });
    expect(base.venue).toEqual({ dexId: 'baseline', labels: [] });
    expect(eth.venue).toBeNull();
    expect(bsc.venue).toBeNull();
  });
});
