import { buildProviderQuoteFetchers } from './provider-quote.fetchers';
import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import { emptySnapshotQuote } from 'snapshot/domain/snapshot-quote.types';

/**
 * Failing-first: supply fields end-to-end (totalSupply, circulatingSupply,
 * maxSupply). Providers that carry supplies wire them; providers without
 * supplies yield null without crashing; the merge prefers real values.
 */
describe('provider-quote fetchers (supply fields)', () => {
  const sol = 'So11111111111111111111111111111111111111112';

  function deps(overrides: Record<string, unknown> = {}) {
    return {
      dexscreener: {
        getBestPairSummaryForChain: async () => ({
          priceUsd: 1.5,
          marketCap: 100,
          fdv: 200,
          liquidityUsd: 50,
          volume24h: 10,
          priceChange24h: 2,
          baseToken: { address: sol, symbol: 'TKN', name: 'Token' },
          quoteToken: { address: null, symbol: null, name: null },
        }),
      },
      geckoterminal: {
        getTokenInfo: async () => ({
          priceUsd: 1.5,
          marketCapUsd: 100,
          fdvUsd: 200,
          volumeUsdH24: 10,
          priceChangePercentH24: 2,
          holders: 42,
          top10HolderPercent: 5,
          symbol: 'TKN',
          name: 'Token',
          totalSupply: '1000000',
        }),
      },
      birdeye: {
        getTokenOverview: async () => ({
          price: 1.5,
          mc: 100,
          liquidity: 50,
          volume24h: 10,
          priceChange24h: 2,
          totalSupply: 999000,
          holder: 42,
          symbol: 'TKN',
          name: 'Token',
        }),
      },
      moralis: {
        getTokenAnalytics: async () => null,
        getTokenHolders: async () => null,
      },
      rugcheck: {
        getSummary: async () => null,
      },
      solanaRpc: {
        getTokenSupply: async () => null,
        getTokenLargestAccounts: async () => null,
      },
      coingecko: {
        getTokenContractInfo: async () => ({
          priceUsd: 1.5,
          marketCapUsd: 100,
          fdvUsd: 200,
          volumeUsdH24: 10,
          priceChangePercent24h: 2,
          totalSupply: 1000000,
          circulatingSupply: 800000,
          maxSupply: 1000000,
          imageUrls: [],
        }),
      },
      mobula: {
        getTokenMarkets: async () => ({ totalSupply: 1000000 }),
      },
      ...overrides,
    } as never;
  }

  it('geckoterminal maps total_supply (string) to totalSupply (number)', async () => {
    const fetchers = buildProviderQuoteFetchers(deps());
    const gecko = fetchers.find((f) => f.name === 'geckoterminal');
    const quote = await gecko!.fetch('solana', sol);
    expect(quote?.totalSupply).toBe(1000000);
  });

  it('birdeye maps totalSupply', async () => {
    const fetchers = buildProviderQuoteFetchers(deps());
    const birdeye = fetchers.find((f) => f.name === 'birdeye');
    const quote = await birdeye!.fetch('solana', sol);
    expect(quote?.totalSupply).toBe(999000);
  });

  it('mobula maps totalSupply (circulating/max stay null)', async () => {
    const fetchers = buildProviderQuoteFetchers(deps());
    const mobula = fetchers.find((f) => f.name === 'mobula');
    const quote = await mobula!.fetch('solana', sol);
    expect(quote?.totalSupply).toBe(1000000);
    expect(quote?.circulatingSupply ?? null).toBeNull();
    expect(quote?.maxSupply ?? null).toBeNull();
  });

  it('coingecko maps total/circulating/max supply', async () => {
    const fetchers = buildProviderQuoteFetchers(deps());
    const coingecko = fetchers.find((f) => f.name === 'coingecko');
    const quote = await coingecko!.fetch('solana', sol);
    expect(quote?.totalSupply).toBe(1000000);
    expect(quote?.circulatingSupply).toBe(800000);
    expect(quote?.maxSupply).toBe(1000000);
  });

  it('adversarial: provider without supplies leaves nulls, no crash', async () => {
    const fetchers = buildProviderQuoteFetchers(
      deps({
        geckoterminal: { getTokenInfo: async () => null },
        birdeye: { getTokenOverview: async () => null },
        coingecko: { getTokenContractInfo: async () => null },
        mobula: { getTokenMarkets: async () => null },
      }),
    );
    const aggregator = new SnapshotAggregatorService();
    const outcome = await aggregator.aggregate('solana', sol, fetchers);
    expect(outcome.quote.totalSupply).toBeNull();
    expect(outcome.quote.circulatingSupply).toBeNull();
    expect(outcome.quote.maxSupply).toBeNull();
  });

  it('merge prefers real supply values (first-non-null wins)', async () => {
    const fetchers = buildProviderQuoteFetchers(deps());
    const aggregator = new SnapshotAggregatorService();
    const outcome = await aggregator.aggregate('solana', sol, fetchers);
    // geckoterminal precedes birdeye in registry order
    expect(outcome.quote.totalSupply).toBe(1000000);
    expect(outcome.quote.circulatingSupply).toBe(800000);
    expect(outcome.quote.maxSupply).toBe(1000000);
  });

  it('emptySnapshotQuote carries null supplies', () => {
    const empty = emptySnapshotQuote();
    expect(empty.totalSupply).toBeNull();
    expect(empty.circulatingSupply).toBeNull();
    expect(empty.maxSupply).toBeNull();
  });
});
