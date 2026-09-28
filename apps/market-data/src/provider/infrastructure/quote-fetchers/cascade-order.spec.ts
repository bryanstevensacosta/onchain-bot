import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import type { QuoteFetcher } from 'snapshot/domain/snapshot-quote.types';
import { buildProviderQuoteFetchers } from './provider-quote.fetchers';

/**
 * Failing-first spec (Tramo 3, todo 16, P48-bis).
 *
 * ccxt goes FIRST where it covers (CEX tickers/OHLCV); every other
 * fetcher keeps its existing relative order and the merge stays
 * first-non-null per field. Uncovered inputs (onchain addresses)
 * short-circuit to null so the cascade falls back untouched.
 */
function stubDeps(overrides: Record<string, unknown> = {}): never {
  return {
    dexscreener: {
      getBestPairSummary: async () => ({
        priceUsd: '9.99',
        marketCap: null,
        fdv: null,
        liquidityUsd: null,
        volume24h: null,
        priceChange24h: null,
        baseToken: { symbol: 'DEX', name: 'Dex Token' },
      }),
    },
    geckoterminal: { getTokenInfo: async () => null },
    birdeye: { getTokenOverview: async () => null },
    coingecko: { getTokenContractInfo: async () => null },
    mobula: { getTokenMarkets: async () => null },
    moralis: {
      getTokenAnalytics: async () => null,
      getTokenHolders: async () => null,
    },
    rugcheck: { getSummary: async () => null },
    ccxt: {
      defaultExchange: 'binance',
      fetchTicker: async () => null,
    },
    ...overrides,
  } as unknown as never;
}

describe('ccxt-first cascade order (P48-bis)', () => {
  it('places ccxt first and keeps free providers before keyed fallback', () => {
    const fetchers = buildProviderQuoteFetchers(stubDeps());
    expect(fetchers.map((fetcher) => fetcher.name)).toEqual([
      'ccxt',
      'dexscreener',
      'geckoterminal',
      'rugcheck',
      'birdeye',
      'coingecko',
      'mobula',
      'moralis',
    ]);
  });

  it('lets ccxt win where it covers (CEX symbol merge priority)', async () => {
    const fetchers = buildProviderQuoteFetchers(
      stubDeps({
        ccxt: {
          defaultExchange: 'binance',
          fetchTicker: async () => ({ symbol: 'BTC/USDT', last: 42000.5 }),
        },
      }),
    );
    const aggregator = new SnapshotAggregatorService();
    const outcome = await aggregator.aggregate('solana', 'BTC/USDT', fetchers);
    expect(outcome.quote.priceUsd).toBe(42000.5);
    expect(outcome.sources[0]).toBe('ccxt');
  });

  it('falls back to dexscreener for onchain addresses (ccxt uncovered)', async () => {
    const fetchers: ReadonlyArray<QuoteFetcher> =
      buildProviderQuoteFetchers(stubDeps());
    const ccxt = fetchers[0];
    expect(
      ccxt.covers?.('solana', 'So11111111111111111111111111111111111111112'),
    ).toBe(false);
    expect(ccxt.covers?.('solana', 'BTC/USDT')).toBe(true);
    const aggregator = new SnapshotAggregatorService();
    const outcome = await aggregator.aggregate(
      'solana',
      'So11111111111111111111111111111111111111112',
      fetchers,
    );
    expect(outcome.quote.priceUsd).toBe(9.99);
    expect(outcome.sources).toContain('dexscreener');
    expect(outcome.sources).not.toContain('ccxt');
  });
});
