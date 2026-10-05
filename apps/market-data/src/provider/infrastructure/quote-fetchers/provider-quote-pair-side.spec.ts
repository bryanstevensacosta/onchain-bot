import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import {
  DEXSCREENER_CONFIG,
  type DexScreenerConfig,
} from 'provider/infrastructure/dexscreener/dexscreener.config';
import type { DexScreenerPair } from 'provider/infrastructure/dexscreener/dexscreener.types';
import { buildProviderQuoteFetchers } from 'provider/infrastructure/quote-fetchers/provider-quote.fetchers';

/**
 * Pair-side attribution (plan todo 20): the best-liquidity pair may
 * carry the requested mint on EITHER side. The pre-fix identity step
 * took `best.baseToken` unconditionally, so a quote-side query
 * inherited the base identity (live case: USDC mint in a PUMP/USDC
 * pool resolved `symbol: 'PUMP'` — see
 * `.omo/notepads/dexter-null-rootcause.md` §8 side-finding).
 *
 * Rule pinned here: requested mint must equal `baseToken.address`
 * or `quoteToken.address` (case-insensitive); the matching side's
 * symbol/name wins; a pair with our mint on neither side is
 * discarded (fetcher returns null, never throws).
 */
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const PUMP = 'pumpCmXweJgJGVT4V9M9tB6VsWTxMTZQV5PiHfVPWU5';

function pair(overrides: Partial<DexScreenerPair>): DexScreenerPair {
  return {
    chainId: 'solana',
    dexId: 'raydium',
    url: 'https://dexscreener.com/solana/pair',
    pairAddress: 'pair1',
    labels: [],
    baseToken: { address: PUMP, name: 'Pump', symbol: 'PUMP' },
    quoteToken: { address: USDC, name: 'USD Coin', symbol: 'USDC' },
    priceNative: '1000',
    priceUsd: '0.9998',
    txns: { h24: { buys: 10, sells: 9 } },
    volume: { h24: 5000 },
    priceChange: { h24: 0.1 },
    liquidity: { usd: 250000, base: 1, quote: 1 },
    fdv: 1000000,
    marketCap: 999000,
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

function stubDeps(
  summary: unknown,
): Parameters<typeof buildProviderQuoteFetchers>[0] {
  return {
    dexscreener: {
      getBestPairSummaryForChain: async () => summary as never,
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

describe('toPairSummary quoteToken plumbing (plan todo 20)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('carries the quote side through the chain-scoped summary', async () => {
    const service = await realService();
    jest
      .spyOn(service, 'getPairsByChain')
      .mockResolvedValue([pair({ chainId: 'solana' })]);
    const summary = await service.getBestPairSummaryForChain('solana', USDC);
    expect(summary?.quoteToken).toEqual({
      address: USDC,
      name: 'USD Coin',
      symbol: 'USDC',
    });
    expect(summary?.baseToken.symbol).toBe('PUMP');
  });

  it('carries the quote side through the legacy cross-chain summary', async () => {
    const service = await realService();
    jest
      .spyOn(service, 'getPairsByToken')
      .mockResolvedValue([pair({ chainId: 'solana' })]);
    const summary = await service.getBestPairSummary(USDC);
    expect(summary?.quoteToken).toEqual({
      address: USDC,
      name: 'USD Coin',
      symbol: 'USDC',
    });
  });

  it('nulls quote fields when the pair carries no usable quote side', async () => {
    const service = await realService();
    jest.spyOn(service, 'getPairsByChain').mockResolvedValue([
      pair({
        chainId: 'solana',
        quoteToken: { address: null, name: null, symbol: null },
      }),
    ]);
    const summary = await service.getBestPairSummaryForChain('solana', PUMP);
    expect(summary?.quoteToken).toEqual({
      address: null,
      name: null,
      symbol: null,
    });
  });
});

describe('dexscreener quote fetcher side verification (plan todo 20)', () => {
  function dexFetcher(summary: unknown) {
    const fetchers = buildProviderQuoteFetchers(stubDeps(summary));
    const dex = fetchers.find((fetcher) => fetcher.name === 'dexscreener');
    if (!dex) throw new Error('dexscreener fetcher missing');
    return dex;
  }

  function summaryFrom(p: DexScreenerPair) {
    return {
      pairAddress: p.pairAddress,
      dexId: p.dexId,
      labels: [...(p.labels ?? [])],
      baseToken: { ...p.baseToken },
      quoteToken: {
        address: p.quoteToken?.address ?? null,
        name: p.quoteToken?.name ?? null,
        symbol: p.quoteToken?.symbol ?? null,
      },
      priceUsd: p.priceUsd,
      priceNative: p.priceNative,
      liquidityUsd: p.liquidity?.usd ?? null,
      volume24h: 5000,
      fdv: p.fdv,
      marketCap: p.marketCap,
      priceChange24h: p.priceChange?.h24 ?? null,
      txns24h: { buys: 10, sells: 9 },
    };
  }

  it('quote-side mint resolves the QUOTE identity (USDC, not PUMP)', async () => {
    const quote = await dexFetcher(summaryFrom(pair({}))).fetch('solana', USDC);
    expect(quote?.symbol).toBe('USDC');
    expect(quote?.symbol).not.toBe('PUMP');
    expect(quote?.name).toBe('USD Coin');
    expect(quote?.priceUsd).toBe(0.9998);
  });

  it('base-side mint still resolves the BASE identity', async () => {
    const quote = await dexFetcher(summaryFrom(pair({}))).fetch('solana', PUMP);
    expect(quote?.symbol).toBe('PUMP');
    expect(quote?.name).toBe('Pump');
  });

  it('discards a pair with our mint on neither side (no crash, null)', async () => {
    const quote = await dexFetcher(summaryFrom(pair({}))).fetch(
      'solana',
      'So11111111111111111111111111111111111111112',
    );
    expect(quote).toBeNull();
  });

  it('matches EVM mints case-insensitively (checksum vs lower)', async () => {
    const checksummed = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
    const lower = checksummed.toLowerCase();
    const evmPair = pair({
      chainId: 'ethereum',
      baseToken: { address: lower, name: 'USD Coin', symbol: 'USDC' },
      quoteToken: {
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
        name: 'Wrapped Ether',
        symbol: 'WETH',
      },
    });
    const quote = await dexFetcher(summaryFrom(evmPair)).fetch(
      'ethereum',
      checksummed,
    );
    expect(quote?.symbol).toBe('USDC');
  });
});
