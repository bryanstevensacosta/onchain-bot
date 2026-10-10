import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import axios from 'axios';
import {
  DexScreenerService,
  resolveDexScreenerSlug,
  selectBestPairSummaryForSlug,
} from './dexscreener.service';
import {
  DEXSCREENER_CONFIG,
  type DexScreenerConfig,
} from './dexscreener.config';
import type { DexScreenerPair } from './dexscreener.types';
import { buildProviderQuoteFetchers } from '../quote-fetchers/provider-quote.fetchers';

/**
 * Top-5 exploitation leg #1 (dexter plan todo 31): DexScreener `search`
 * + batch `tokens/v1` wired as fetcher fallbacks + `unichain` slug.
 *
 * Live ground truth (this lane, 2026-10-09):
 * - `GET /tokens/v1/solana/<SOL>` answers a BARE pair array (the old
 *   `{ pairs }` envelope read returned null for every input — fixed,
 *   both shapes accepted).
 * - `GET /latest/dex/search?q=unichain` answers 2 rows with
 *   `chainId: 'unichain'` (slug-identity mapping proven).
 */
const MINT = 'So11111111111111111111111111111111111111112';

function pair(overrides: Partial<DexScreenerPair> = {}): DexScreenerPair {
  return {
    chainId: 'solana',
    dexId: 'orca',
    url: 'https://dexscreener.com/solana/pool',
    pairAddress: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE',
    labels: ['wp'],
    baseToken: { address: MINT, name: 'Wrapped SOL', symbol: 'SOL' },
    quoteToken: {
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      name: 'USD Coin',
      symbol: 'USDC',
    },
    priceNative: '109.44',
    priceUsd: '109.44',
    txns: { h24: { buys: 1, sells: 2 } },
    volume: { h24: 100 },
    priceChange: { h24: 1.5 },
    liquidity: { usd: 1000, base: 10, quote: 20 },
    fdv: 2_000,
    marketCap: 1_900,
    pairCreatedAt: 1_700_000_000_000,
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
  return module.get(DexScreenerService);
}

function stubDeps(overrides: Record<string, unknown> = {}) {
  return {
    dexscreener: {
      getBestPairSummaryForChain: async () => null,
      search: async () => null,
      getTokensInfo: async () => null,
    },
    geckoterminal: { getTokenInfo: async () => null },
    birdeye: { getTokenOverview: async () => null },
    ccxt: { fetchTicker: async () => null, defaultExchange: 'binance' },
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
    ...overrides,
  } as never;
}

function dexFetcher(d: ReturnType<typeof stubDeps>) {
  return buildProviderQuoteFetchers(d).find((f) => f.name === 'dexscreener')!;
}

describe('DexScreener top-5 (todo 31: search + tokens/v1 + unichain)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps unichain 1:1 and keeps unknown chains null (zero network)', () => {
    expect(resolveDexScreenerSlug('unichain')).toBe('unichain');
    expect(resolveDexScreenerSlug('solana')).toBe('solana');
    expect(resolveDexScreenerSlug('optimism')).toBeNull();
  });

  it('getTokensInfo accepts the live bare-array shape', async () => {
    const service = await realService();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({ data: [pair()] });
    const pairs = await service.getTokensInfo('solana', MINT);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/tokens/v1/solana/'),
      expect.anything(),
    );
    expect(pairs).toHaveLength(1);
    expect(pairs?.[0].baseToken.symbol).toBe('SOL');
  });

  it('getTokensInfo still accepts the legacy { pairs } envelope', async () => {
    const service = await realService();
    jest.spyOn(axios, 'get').mockResolvedValue({ data: { pairs: [pair()] } });
    const pairs = await service.getTokensInfo('solana', MINT);
    expect(pairs).toHaveLength(1);
  });

  it('selectBestPairSummaryForSlug filters foreign rows + picks best liquidity', () => {
    const foreign = pair({
      chainId: 'ethereum',
      liquidity: { usd: 999_999, base: 1, quote: 1 },
    });
    const thin = pair({ liquidity: { usd: 10, base: 1, quote: 1 } });
    const fat = pair({ liquidity: { usd: 50_000, base: 1, quote: 1 } });
    const best = selectBestPairSummaryForSlug([foreign, thin, fat], 'solana');
    expect(best?.liquidityUsd).toBe(50_000);
    expect(selectBestPairSummaryForSlug([foreign], 'solana')).toBeNull();
    expect(selectBestPairSummaryForSlug([], 'solana')).toBeNull();
    expect(selectBestPairSummaryForSlug(null, 'solana')).toBeNull();
  });

  it('fetcher supports unichain (slug + chain list together)', () => {
    expect(dexFetcher(stubDeps()).supportsChains).toContain('unichain');
  });

  it('strict hit never touches the fallback legs (no-regression + quota)', async () => {
    const search = jest.fn(async () => null);
    const getTokensInfo = jest.fn(async () => null);
    const d = stubDeps({
      dexscreener: {
        getBestPairSummaryForChain: async () => ({
          pairAddress: 'p',
          dexId: 'orca',
          labels: [],
          baseToken: { address: MINT, name: 'Wrapped SOL', symbol: 'SOL' },
          quoteToken: { address: null, name: null, symbol: null },
          priceUsd: '109.44',
          priceNative: '109.44',
          liquidityUsd: 1000,
          volume24h: 100,
          fdv: 2000,
          marketCap: 1900,
          priceChange24h: 1.5,
          txns24h: { buys: 1, sells: 2 },
        }),
        search,
        getTokensInfo,
      },
    });
    const quote = await dexFetcher(d).fetch('solana', MINT);
    expect(quote?.symbol).toBe('SOL');
    expect(search).not.toHaveBeenCalled();
    expect(getTokensInfo).not.toHaveBeenCalled();
  });

  it('strict miss falls back to search (side-verified)', async () => {
    const d = stubDeps({
      dexscreener: {
        getBestPairSummaryForChain: async () => null,
        search: async () => [pair()],
        getTokensInfo: jest.fn(async () => null),
      },
    });
    const quote = await dexFetcher(d).fetch('solana', MINT);
    expect(quote?.symbol).toBe('SOL');
    expect(quote?.priceUsd).toBe(109.44);
  });

  it('search + strict miss falls back to tokens/v1', async () => {
    const getTokensInfo = jest.fn(async () => [pair()]);
    const d = stubDeps({
      dexscreener: {
        getBestPairSummaryForChain: async () => null,
        search: async () => [],
        getTokensInfo,
      },
    });
    const quote = await dexFetcher(d).fetch('solana', MINT);
    expect(quote?.symbol).toBe('SOL');
    expect(getTokensInfo).toHaveBeenCalledWith('solana', MINT);
  });

  it('foreign-mint fallback rows are discarded (side check covers all legs)', async () => {
    const foreign = pair({
      baseToken: { address: 'OTHER', name: 'Scam', symbol: 'SCAM' },
      quoteToken: { address: 'ALS0OTHER', name: null, symbol: null },
    });
    const d = stubDeps({
      dexscreener: {
        getBestPairSummaryForChain: async () => null,
        search: async () => [foreign],
        getTokensInfo: async () => [foreign],
      },
    });
    await expect(dexFetcher(d).fetch('solana', MINT)).resolves.toBeNull();
  });

  it('unmapped chain resolves null without touching the network', async () => {
    const search = jest.fn(async () => [pair()]);
    const getTokensInfo = jest.fn(async () => [pair()]);
    const strict = jest.fn(async () => ({
      pairAddress: 'p',
      dexId: 'x',
      labels: [],
      baseToken: { address: MINT, name: 'S', symbol: 'S' },
      quoteToken: { address: null, name: null, symbol: null },
      priceUsd: '1',
      priceNative: '1',
      liquidityUsd: 1,
      volume24h: 1,
      fdv: 1,
      marketCap: 1,
      priceChange24h: 0,
      txns24h: { buys: 0, sells: 0 },
    }));
    const d = stubDeps({
      dexscreener: {
        getBestPairSummaryForChain: strict,
        search,
        getTokensInfo,
      },
    });
    await expect(dexFetcher(d).fetch('optimism', MINT)).resolves.toBeNull();
    expect(strict).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
    expect(getTokensInfo).not.toHaveBeenCalled();
  });
});
