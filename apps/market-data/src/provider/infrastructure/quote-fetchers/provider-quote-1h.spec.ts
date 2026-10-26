import { buildProviderQuoteFetchers } from './provider-quote.fetchers';
import type { DexScreenerPairSummary } from 'provider/infrastructure/dexscreener/dexscreener.types';

/**
 * DexScreener 1-hour bucket → snapshot quote (dexter `1H` row).
 *
 * Only the `dexscreener` leg writes `volume1hUsd`, `priceChange1h`,
 * `txns1hBuys` and `txns1hSells`. Absent/non-finite → `null` (never
 * `0`); a real `0` survives; `txns1h` absence nulls BOTH sides (no
 * `{buys:0,sells:0}` default).
 */
const MINT = 'So11111111111111111111111111111111111111112';
const EVM = '0x1111111111111111111111111111111111111111';
const ONE_HOUR_KEYS = [
  'volume1hUsd',
  'priceChange1h',
  'txns1hBuys',
  'txns1hSells',
] as const;

function summary(
  overrides: Partial<DexScreenerPairSummary> = {},
): DexScreenerPairSummary {
  return {
    pairAddress: 'pair1',
    dexId: 'raydium',
    labels: [],
    baseToken: { address: MINT, name: 'SOL', symbol: 'SOL' },
    quoteToken: { address: null, name: null, symbol: null },
    priceUsd: '109.44',
    priceNative: '109.44',
    liquidityUsd: 1000,
    volume24h: 100,
    fdv: 2000,
    marketCap: 1900,
    priceChange24h: 1.5,
    txns24h: { buys: 1, sells: 2 },
    pairCreatedAt: null,
    volume1hUsd: 7.75,
    priceChange1h: -0.5,
    txns1h: { buys: 4, sells: 2 },
    ...overrides,
  };
}

function deps(overrides: Record<string, unknown> = {}) {
  return {
    dexscreener: {
      getBestPairSummaryForChain: async () => null,
      search: async () => null,
      getTokensInfo: async () => null,
    },
    // A "rich" stub per leg: every one of these produces a non-null
    // quote so the no-write assertion below is meaningful.
    geckoterminal: {
      getTokenInfo: async () => ({
        address: MINT,
        name: 'SOL',
        symbol: 'SOL',
        totalSupply: '1000',
        decimals: 9,
        holders: 10,
        top10HolderPercent: 50,
        gtScore: null,
        priceUsd: 1,
        fdvUsd: 1,
        marketCapUsd: 1,
        volumeUsdH24: 1,
        priceChangePercentH24: 1,
        gtCategoryIds: null,
      }),
      getTokenPools: async () => null,
    },
    birdeye: {
      getTokenOverview: async () => ({
        address: MINT,
        price: 1,
        priceChange24h: 1,
        volume24h: 1,
        liquidity: 1,
        mc: 1,
        totalSupply: 1,
        holder: 1,
        decimals: 9,
        name: 'SOL',
        symbol: 'SOL',
      }),
    },
    ccxt: {
      defaultExchange: 'binance',
      fetchTicker: async () => ({ last: 1, symbol: 'BTC/USDT' }),
    },
    coingecko: {
      getTokenContractInfo: async () => ({
        priceUsd: 1,
        marketCapUsd: 1,
        fdvUsd: 1,
        volumeUsdH24: 1,
        priceChangePercent24h: 1,
        totalSupply: 1,
        circulatingSupply: 1,
        maxSupply: 1,
        imageUrls: [],
      }),
    },
    mobula: {
      getTokenMarkets: async () => ({
        priceUSD: 1,
        approximateReserveUSD: 1,
        marketCapUSD: 1,
        marketCapDilutedUSD: 1,
        top10HoldingsPercentage: 1,
        totalSupply: 1,
      }),
    },
    moralis: {
      getTokenAnalytics: async () => ({
        priceUsd: 1,
        liquidityUsd: 1,
        fdvUsd: 1,
        priceChange24h: 1,
      }),
      getTokenHolders: async () => ({
        holders: 1,
        top10HolderPercent: 1,
      }),
    },
    rugcheck: {
      getSummary: async () => ({ lockedLiquidity: [], burnedPercent: 1 }),
    },
    solanaRpc: {
      getTokenSupply: async () => ({ uiAmount: 1, amount: '1', decimals: 0 }),
      getTokenLargestAccounts: async () => null,
    },
    defillama: { getPrice: async () => ({ price: 1, symbol: 'SOL' }) },
    etherscan: { getTokenHolderCount: async () => 10 },
    multicall: null,
    ...overrides,
  } as never;
}

function fetcher(d: ReturnType<typeof deps>, name: string) {
  const found = buildProviderQuoteFetchers(d).find((f) => f.name === name);
  if (!found) throw new Error(`fetcher ${name} missing`);
  return found;
}

describe('dexscreener quote fetcher — 1h bucket mapping', () => {
  it('emits volume1hUsd / priceChange1h / txns1h buys+sells from the summary', async () => {
    const d = deps({
      dexscreener: {
        getBestPairSummaryForChain: async () => summary(),
        search: async () => null,
        getTokensInfo: async () => null,
      },
    });
    const quote = await fetcher(d, 'dexscreener').fetch('solana', MINT);
    expect(quote?.volume1hUsd).toBe(7.75);
    expect(quote?.priceChange1h).toBe(-0.5);
    expect(quote?.txns1hBuys).toBe(4);
    expect(quote?.txns1hSells).toBe(2);
  });

  it('keeps a real 0 (never collapses it to null)', async () => {
    const d = deps({
      dexscreener: {
        getBestPairSummaryForChain: async () =>
          summary({
            volume1hUsd: 0,
            priceChange1h: 0,
            txns1h: { buys: 0, sells: 0 },
          }),
        search: async () => null,
        getTokensInfo: async () => null,
      },
    });
    const quote = await fetcher(d, 'dexscreener').fetch('solana', MINT);
    expect(quote?.volume1hUsd).toBe(0);
    expect(quote?.priceChange1h).toBe(0);
    expect(quote?.txns1hBuys).toBe(0);
    expect(quote?.txns1hSells).toBe(0);
  });

  it('nulls absent/non-finite buckets and both txn sides when txns1h is absent', async () => {
    const d = deps({
      dexscreener: {
        getBestPairSummaryForChain: async () =>
          summary({
            volume1hUsd: null,
            priceChange1h: null,
            txns1h: null,
          }),
        search: async () => null,
        getTokensInfo: async () => null,
      },
    });
    const quote = await fetcher(d, 'dexscreener').fetch('solana', MINT);
    expect(quote?.volume1hUsd).toBeNull();
    expect(quote?.priceChange1h).toBeNull();
    expect(quote?.txns1hBuys).toBeNull();
    expect(quote?.txns1hSells).toBeNull();
  });

  it('applies a finite guard per txn side (NaN → null, sibling survives)', async () => {
    const d = deps({
      dexscreener: {
        getBestPairSummaryForChain: async () =>
          summary({
            txns1h: { buys: Number.NaN, sells: 3 },
          }),
        search: async () => null,
        getTokensInfo: async () => null,
      },
    });
    const quote = await fetcher(d, 'dexscreener').fetch('solana', MINT);
    expect(quote?.txns1hBuys).toBeNull();
    expect(quote?.txns1hSells).toBe(3);
  });
});

describe('other quote legs never write the 1h fields', () => {
  const legs: ReadonlyArray<[name: string, chain: string, address: string]> = [
    ['ccxt', 'binance', 'BTC/USDT'],
    ['geckoterminal', 'solana', MINT],
    ['solana-rpc', 'solana', MINT],
    ['rugcheck', 'solana', MINT],
    ['defillama', 'solana', MINT],
    ['birdeye', 'solana', MINT],
    ['coingecko', 'solana', MINT],
    ['mobula', 'solana', MINT],
    ['moralis', 'ethereum', EVM],
    ['etherscan', 'ethereum', EVM],
  ];

  it.each(legs)('%s emits no 1h key', async (name, chain, address) => {
    const quote = await fetcher(deps(), name).fetch(chain, address);
    expect(quote).not.toBeNull();
    for (const key of ONE_HOUR_KEYS) {
      expect(quote).not.toHaveProperty(key);
    }
  });
});
