import { buildProviderQuoteFetchers } from './provider-quote.fetchers';
import type { DexScreenerPairSummary } from 'provider/infrastructure/dexscreener/dexscreener.types';
import type { GeckoTerminalPoolResource } from 'provider/infrastructure/geckoterminal/geckoterminal.types';

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
const OTHER = '0x0000000000000000000000000000000000000002';
const EVM_POOL = '0x7c5e1f873f02b042995d0c6ebee94120a740e348';
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

/**
 * GeckoTerminal quote fetcher — 1h bucket off the pool pick it ALREADY
 * fetches (dexter `1H` row, zero extra HTTP calls).
 *
 * The two pool legs (`needsPool` gap-fill and the `searchPools`
 * Gecko-only discovery) already forward liquidity/volume24h/change24h
 * from the same pick; the 1h bucket rides along under the identical
 * null-only contract (real `0` survives, absent → `null`, txns are a
 * whole pair). Live regression this pins: a Gecko-only token whose
 * 24h change comes from ITS OWN pool pick never enters the OHLC
 * derivation leg (native-wins), so the fetcher mapping is the only
 * place the 1h bucket can reach the card.
 */
function gPool(): GeckoTerminalPoolResource {
  return {
    id: `bsc_${EVM_POOL}`,
    type: 'pool',
    attributes: {
      address: EVM_POOL,
      base_token_price_usd: '0.000002130265097',
      quote_token_price_usd: '2692.72',
      fdv_usd: '2130.265097',
      reserve_in_usd: '4044.5769',
      volume_usd: { h24: '0.2577854268', h1: '0' },
      price_change_percentage: { h24: '0', h1: '0' },
      transactions: { h1: { buys: 0, sells: 0 } },
    },
    relationships: {
      base_token: { data: { id: `bsc_${EVM}` } },
      quote_token: { data: { id: `bsc_${OTHER}` } },
      dex: { data: { id: 'pancakeswap_v2', type: 'dex' } },
    },
  };
}

function gInfo(overrides: Record<string, unknown> = {}) {
  return {
    address: EVM,
    name: 'Flap Token',
    symbol: 'FLAP',
    totalSupply: '1000000000',
    decimals: 18,
    holders: 92,
    top10HolderPercent: 12,
    gtScore: null,
    priceUsd: '0.000002130265097',
    fdvUsd: '2130.265097',
    marketCapUsd: null,
    volumeUsdH24: null,
    priceChangePercentH24: null,
    gtCategoryIds: null,
    ...overrides,
  };
}

describe('geckoterminal quote fetcher — 1h bucket off the same pool pick', () => {
  it('forwards the 1h bucket on the needsPool gap-fill leg', async () => {
    const d = deps({
      geckoterminal: {
        getTokenInfo: async () => gInfo({ priceUsd: null }),
        getTokenPools: async () => [gPool()],
      },
    });

    const quote = await fetcher(d, 'geckoterminal').fetch('bsc', EVM);

    expect(quote?.priceChange24h).toBe(0);
    expect(quote?.volume1hUsd).toBe(0);
    expect(quote?.priceChange1h).toBe(0);
    expect(quote?.txns1hBuys).toBe(0);
    expect(quote?.txns1hSells).toBe(0);
  });

  it('forwards the 1h bucket on the search-pools discovery leg', async () => {
    const getTokenPools = jest.fn(async () => null);
    const d = deps({
      geckoterminal: {
        getTokenInfo: async () => null,
        getTokenPools,
        searchPools: async () => [gPool()],
      },
    });

    const quote = await fetcher(d, 'geckoterminal').fetch('bsc', EVM);

    expect(quote?.volume1hUsd).toBe(0);
    expect(quote?.priceChange1h).toBe(0);
    expect(quote?.txns1hBuys).toBe(0);
    expect(quote?.txns1hSells).toBe(0);
    expect(getTokenPools).not.toHaveBeenCalled();
  });
});
