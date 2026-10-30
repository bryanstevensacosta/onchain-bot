import { buildProviderQuoteFetchers } from './provider-quote.fetchers';
import type {
  DexScreenerPair,
  DexScreenerPairSummary,
} from 'provider/infrastructure/dexscreener/dexscreener.types';

/**
 * DexScreener 5-minute bucket → snapshot quote (dexter `5M` row,
 * `rick-compact-card` §10.16).
 *
 * The `dexscreener` fetcher is the SOLE writer of `volume5mUsd`,
 * `priceChange5m`, `txns5mBuys` and `txns5mSells`. Source = the
 * `dexId === 'pumpfun'` pair (the strict discovery pick is
 * best-liquidity, i.e. the migrated Meteora pool for the reference
 * mint), fetched through exactly ONE extra Solana-only
 * `getPairsByToken` call. Honesty is by quote CLASS: the four values
 * are emitted only when the side OPPOSITE our mint is USD/SOL — the
 * reference mint's `Bitcoin` quote nulls them instead of mislabeling.
 */
const MINT = '2dNdT2gD8x2BkmffjAyQe3o6hES33jg1tAgTJCRkvBTC';
const BTC_QUOTE = 'HytpiyuR3sVXGB5UqoqrnThCPH2X1tWVm5neep3Dpump';
const WSOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const OTHER = 'So11111111111111111111111111111111111111113';
const EVM = '0x1111111111111111111111111111111111111111';
const EVM_POOL = '0x7c5e1f873f02b042995d0c6ebee94120a740e348';
const PUMPFUN_PAIR = '5sqQd6fn8FqNkRerAYcz2gewDd97JHe9fvGASwRqQiCC';
const METEORA_PAIR = 'DGTReDmeteoraPairFixture1111111111111111';
const FIVE_MINUTE_KEYS = [
  'volume5mUsd',
  'priceChange5m',
  'txns5mBuys',
  'txns5mSells',
] as const;

function summary(
  overrides: Partial<DexScreenerPairSummary> = {},
): DexScreenerPairSummary {
  return {
    pairAddress: METEORA_PAIR,
    dexId: 'meteora',
    labels: ['DYN2'],
    baseToken: { address: MINT, name: 'Rick', symbol: 'RICK' },
    quoteToken: { address: WSOL, name: 'Wrapped SOL', symbol: 'SOL' },
    priceUsd: '0.000008261',
    priceNative: '0.00000005',
    liquidityUsd: 25.53,
    volume24h: 100,
    fdv: 8261,
    marketCap: 8261,
    priceChange24h: 1.5,
    txns24h: { buys: 1, sells: 2 },
    pairCreatedAt: null,
    volume1hUsd: 7.75,
    priceChange1h: -0.5,
    txns1h: { buys: 4, sells: 2 },
    ...overrides,
  };
}

/** Raw pumpfun row (the shape DexScreener answers for `getPairsByToken`). */
function pumpPair(overrides: Partial<DexScreenerPair> = {}): DexScreenerPair {
  return {
    chainId: 'solana',
    dexId: 'pumpfun',
    url: 'https://dexscreener.com/solana/pair',
    pairAddress: PUMPFUN_PAIR,
    labels: [],
    baseToken: { address: MINT, name: 'Rick', symbol: 'RICK' },
    quoteToken: { address: BTC_QUOTE, name: 'Bitcoin', symbol: 'Bitcoin' },
    priceNative: '0.0000001',
    priceUsd: null,
    txns: {
      h24: { buys: 10, sells: 5 },
      m5: { buys: 1, sells: 3 },
    },
    volume: { h24: 1000, m5: 0 },
    priceChange: { h24: 2.5, m5: -1.25 },
    liquidity: null,
    fdv: null,
    marketCap: null,
    pairCreatedAt: null,
    ...overrides,
  };
}

function deps(dexscreener: Record<string, unknown>) {
  return {
    dexscreener,
    geckoterminal: {
      getTokenInfo: async () => null,
      getTokenPools: async () => null,
    },
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
  } as never;
}

function dexFetcher(d: ReturnType<typeof deps>) {
  const found = buildProviderQuoteFetchers(d).find(
    (fetcher) => fetcher.name === 'dexscreener',
  );
  if (!found) throw new Error('dexscreener fetcher missing');
  return found;
}

describe('dexscreener quote fetcher — 5m bucket (pumpfun pair)', () => {
  it('reference shape: pumpfun pair quoted in Bitcoin emits all four null, rest unchanged', async () => {
    const getPairsByToken = jest.fn(async () => [pumpPair()]);
    const quote = await dexFetcher(
      deps({
        getBestPairSummaryForChain: async () => summary(),
        getPairsByToken,
      }),
    ).fetch('solana', MINT);

    // The gate is quote-CLASS: DexScreener does not measure the
    // BTC-quoted market in USD, so the row stays silent.
    for (const key of FIVE_MINUTE_KEYS) {
      expect(quote).toHaveProperty(key);
      expect(quote?.[key]).toBeNull();
    }
    // Exactly one extra keyless call, and the rest of the quote is
    // byte-identical to the pre-5m mapping.
    expect(getPairsByToken).toHaveBeenCalledTimes(1);
    expect(getPairsByToken).toHaveBeenCalledWith(MINT);
    expect(quote?.priceUsd).toBe(0.000008261);
    expect(quote?.symbol).toBe('RICK');
    expect(quote?.liquidityUsd).toBe(25.53);
    expect(quote?.volume1hUsd).toBe(7.75);
    expect(quote?.priceChange1h).toBe(-0.5);
    expect(quote?.txns1hBuys).toBe(4);
    expect(quote?.txns1hSells).toBe(2);
  });

  it('pumpfun pair quoted in WSOL emits the four values verbatim (real 0 survives)', async () => {
    const quote = await dexFetcher(
      deps({
        getBestPairSummaryForChain: async () => summary(),
        getPairsByToken: async () => [
          pumpPair({
            quoteToken: { address: WSOL, name: 'Wrapped SOL', symbol: 'SOL' },
          }),
        ],
      }),
    ).fetch('solana', MINT);

    expect(quote?.volume5mUsd).toBe(0);
    expect(quote?.priceChange5m).toBe(-1.25);
    expect(quote?.txns5mBuys).toBe(1);
    expect(quote?.txns5mSells).toBe(3);
  });

  it('pumpfun pair quoted in a USDC-symbol asset emits (symbol gate)', async () => {
    const quote = await dexFetcher(
      deps({
        getBestPairSummaryForChain: async () => summary(),
        getPairsByToken: async () => [
          pumpPair({
            // Not the canonical USDC mint on purpose: the CLASS gate
            // accepts the symbol for the stablecoin family.
            quoteToken: { address: OTHER, name: 'USD Coin', symbol: 'usdc' },
          }),
        ],
      }),
    ).fetch('solana', MINT);

    expect(quote?.volume5mUsd).toBe(0);
    expect(quote?.priceChange5m).toBe(-1.25);
    expect(quote?.txns5mBuys).toBe(1);
    expect(quote?.txns5mSells).toBe(3);
  });

  it('our mint on the QUOTE side takes the opposite (base) side for the gate', async () => {
    const quote = await dexFetcher(
      deps({
        getBestPairSummaryForChain: async () =>
          summary({
            baseToken: { address: USDC, name: 'USD Coin', symbol: 'USDC' },
            quoteToken: { address: MINT, name: 'Rick', symbol: 'RICK' },
          }),
        // Pump pair: base is the stablecoin, quote is our mint — the
        // opposite side (base) is USD, so the bucket is measurable.
        getPairsByToken: async () => [
          pumpPair({
            baseToken: { address: USDC, name: 'USD Coin', symbol: 'USDC' },
            quoteToken: { address: MINT, name: 'Rick', symbol: 'RICK' },
          }),
        ],
      }),
    ).fetch('solana', MINT);

    expect(quote?.volume5mUsd).toBe(0);
    expect(quote?.priceChange5m).toBe(-1.25);
    expect(quote?.txns5mBuys).toBe(1);
    expect(quote?.txns5mSells).toBe(3);
  });

  it('non-solana chain makes ZERO extra calls and writes no 5m value', async () => {
    const getPairsByToken = jest.fn(async () => [pumpPair()]);
    const quote = await dexFetcher(
      deps({
        getBestPairSummaryForChain: async () =>
          summary({
            pairAddress: EVM_POOL,
            dexId: 'uniswap',
            baseToken: { address: EVM, name: 'Tok', symbol: 'TOK' },
            quoteToken: { address: USDC, name: 'USD Coin', symbol: 'USDC' },
          }),
        getPairsByToken,
      }),
    ).fetch('base', EVM);

    expect(getPairsByToken).not.toHaveBeenCalled();
    for (const key of FIVE_MINUTE_KEYS) {
      expect(quote?.[key]).toBeNull();
    }
    expect(quote?.symbol).toBe('TOK');
  });

  it('stub dep without getPairsByToken skips silently (no throw)', async () => {
    const quote = await dexFetcher(
      deps({ getBestPairSummaryForChain: async () => summary() }),
    ).fetch('solana', MINT);

    expect(quote?.symbol).toBe('RICK');
    for (const key of FIVE_MINUTE_KEYS) {
      expect(quote?.[key]).toBeNull();
    }
  });

  it('pumpfun pair with our mint on NEITHER side emits null (never a foreign pair)', async () => {
    const quote = await dexFetcher(
      deps({
        getBestPairSummaryForChain: async () => summary(),
        getPairsByToken: async () => [
          pumpPair({
            baseToken: { address: OTHER, name: 'Other', symbol: 'OTHER' },
            quoteToken: { address: WSOL, name: 'Wrapped SOL', symbol: 'SOL' },
          }),
        ],
      }),
    ).fetch('solana', MINT);

    for (const key of FIVE_MINUTE_KEYS) {
      expect(quote?.[key]).toBeNull();
    }
  });

  it('no pumpfun row in the pair list emits null (no fallback to another dex)', async () => {
    const quote = await dexFetcher(
      deps({
        getBestPairSummaryForChain: async () => summary(),
        getPairsByToken: async () => [
          pumpPair({ dexId: 'meteora', pairAddress: METEORA_PAIR }),
        ],
      }),
    ).fetch('solana', MINT);

    for (const key of FIVE_MINUTE_KEYS) {
      expect(quote?.[key]).toBeNull();
    }
  });

  it('partial txns.m5 pair stays BOTH null (no half reading, no {0,0})', async () => {
    const quote = await dexFetcher(
      deps({
        getBestPairSummaryForChain: async () => summary(),
        getPairsByToken: async () => [
          pumpPair({
            quoteToken: { address: WSOL, name: 'Wrapped SOL', symbol: 'SOL' },
            txns: {
              m5: { buys: 1 } as unknown as { buys: number; sells: number },
            },
          }),
        ],
      }),
    ).fetch('solana', MINT);

    expect(quote?.txns5mBuys).toBeNull();
    expect(quote?.txns5mSells).toBeNull();
  });

  it('starts the pair-list pre-fetch before discovery settles and issues EXACTLY ONE call', async () => {
    let releaseStrict: (value: DexScreenerPairSummary | null) => void = () =>
      undefined;
    const strictPending = new Promise<DexScreenerPairSummary | null>(
      (resolve) => {
        releaseStrict = resolve;
      },
    );
    const getPairsByToken = jest.fn(async () => [pumpPair()]);
    const fetcher = dexFetcher(
      deps({
        getBestPairSummaryForChain: () => strictPending,
        getPairsByToken,
      }),
    );

    const pending = fetcher.fetch('solana', MINT);
    // Discovery has NOT settled yet, but the 5m pair-list request is
    // already in flight — the two calls overlap instead of stacking.
    await Promise.resolve();
    expect(getPairsByToken).toHaveBeenCalledTimes(1);

    releaseStrict(summary());
    const quote = await pending;
    expect(quote?.symbol).toBe('RICK');
    expect(getPairsByToken).toHaveBeenCalledTimes(1);
    expect(getPairsByToken).toHaveBeenCalledWith(MINT);
    expect(quote?.volume5mUsd).toBeNull();
  });

  it('call-count contract: ONE on a solana strict hit, ZERO on a non-solana chain', async () => {
    const solanaSpy = jest.fn(async () => [pumpPair()]);
    await dexFetcher(
      deps({
        getBestPairSummaryForChain: async () => summary(),
        getPairsByToken: solanaSpy,
      }),
    ).fetch('solana', MINT);
    expect(solanaSpy).toHaveBeenCalledTimes(1);

    const evmSpy = jest.fn(async () => [pumpPair()]);
    const evmQuote = await dexFetcher(
      deps({
        getBestPairSummaryForChain: async () =>
          summary({
            pairAddress: EVM_POOL,
            dexId: 'uniswap',
            baseToken: { address: EVM, name: 'Tok', symbol: 'TOK' },
            quoteToken: { address: USDC, name: 'USD Coin', symbol: 'USDC' },
          }),
        getPairsByToken: evmSpy,
      }),
    ).fetch('base', EVM);
    expect(evmSpy).not.toHaveBeenCalled();
    for (const key of FIVE_MINUTE_KEYS) {
      expect(evmQuote?.[key]).toBeNull();
    }
  });

  it('a rejecting getPairsByToken never rejects the fetch (nulls, no unhandled rejection)', async () => {
    const getPairsByToken = jest.fn(async () => {
      throw new Error('pair-list boom');
    });
    const quote = await dexFetcher(
      deps({
        getBestPairSummaryForChain: async () => summary(),
        getPairsByToken,
      }),
    ).fetch('solana', MINT);

    // The `.catch` is attached at creation, so the rejection is consumed
    // even though the value is awaited later — the fetcher resolves with
    // the same quote it would serve on any 5m miss.
    expect(quote?.symbol).toBe('RICK');
    expect(quote?.priceUsd).toBe(0.000008261);
    for (const key of FIVE_MINUTE_KEYS) {
      expect(quote?.[key]).toBeNull();
    }
    expect(getPairsByToken).toHaveBeenCalledTimes(1);
  });
});
