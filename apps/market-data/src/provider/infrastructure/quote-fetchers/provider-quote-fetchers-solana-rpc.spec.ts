import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import {
  QUOTE_FETCHER_COST_TIER,
  buildProviderQuoteFetchers,
} from './provider-quote.fetchers';

/**
 * Failing-first: Solana RPC free supplies + holders (Tramo 3,
 * coverage-expand).
 *
 * `getTokenSupply` (total only — the RPC has no max/circulating leg)
 * feeds `totalSupply`; `getTokenLargestAccounts` feeds
 * `top10HolderPercent` (top-10 uiAmount share of the on-chain total).
 * No key needed (public JSON-RPC) — the tier is `free`, solana-only.
 * RPC down -> explicit nulls, never throws (adversarial).
 */
const MINT = 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN';

function stubDeps(overrides: Record<string, unknown> = {}) {
  return {
    dexscreener: { getBestPairSummary: async () => null },
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
    ...overrides,
  } as never;
}

describe('solana-rpc quote fetcher (free supplies + top holders)', () => {
  it('is a free-tier, solana-only fetcher', () => {
    const fetchers = buildProviderQuoteFetchers(stubDeps());
    const rpc = fetchers.find((f) => f.name === 'solana-rpc');
    expect(rpc).toBeDefined();
    expect(rpc!.supportsChains).toEqual(['solana']);
    expect(QUOTE_FETCHER_COST_TIER['solana-rpc']).toBe('free');
  });

  it('maps getTokenSupply uiAmount to totalSupply (max/circulating stay null)', async () => {
    const fetchers = buildProviderQuoteFetchers(
      stubDeps({
        solanaRpc: {
          getTokenSupply: async () => ({
            amount: '10000000000000000',
            decimals: 6,
            uiAmount: 10000000000,
            uiAmountString: '10000000000',
          }),
          getTokenLargestAccounts: async () => null,
        },
      }),
    );
    const rpc = fetchers.find((f) => f.name === 'solana-rpc');
    const quote = await rpc!.fetch('solana', MINT);
    expect(quote?.totalSupply).toBe(10000000000);
    expect(quote?.circulatingSupply ?? null).toBeNull();
    expect(quote?.maxSupply ?? null).toBeNull();
  });

  it('computes top10HolderPercent from the largest accounts share', async () => {
    const fetchers = buildProviderQuoteFetchers(
      stubDeps({
        solanaRpc: {
          getTokenSupply: async () => ({
            amount: '10000000000000000',
            decimals: 6,
            uiAmount: 10000000000,
            uiAmountString: '10000000000',
          }),
          getTokenLargestAccounts: async () => [
            { address: 'A1', amount: '1000000000000000', decimals: 6, uiAmount: 1000000000, uiAmountString: '1000000000' },
            { address: 'A2', amount: '500000000000000', decimals: 6, uiAmount: 500000000, uiAmountString: '500000000' },
          ],
        },
      }),
    );
    const rpc = fetchers.find((f) => f.name === 'solana-rpc');
    const quote = await rpc!.fetch('solana', MINT);
    expect(quote?.top10HolderPercent).toBeCloseTo(15, 5);
  });

  it('adversarial: RPC down -> null, never throws', async () => {
    const fetchers = buildProviderQuoteFetchers(
      stubDeps({
        solanaRpc: {
          getTokenSupply: async () => null,
          getTokenLargestAccounts: async () => null,
        },
      }),
    );
    const rpc = fetchers.find((f) => f.name === 'solana-rpc');
    await expect(rpc!.fetch('solana', MINT)).resolves.toBeNull();
    const aggregator = new SnapshotAggregatorService();
    const outcome = await aggregator.aggregate('solana', MINT, fetchers);
    expect(outcome.quote.totalSupply).toBeNull();
    expect(outcome.quote.top10HolderPercent).toBeNull();
    expect(outcome.errors['solana-rpc']).toBe('no data');
  });

  it('adversarial: throwing RPC client -> null, never throws', async () => {
    const fetchers = buildProviderQuoteFetchers(
      stubDeps({
        solanaRpc: {
          getTokenSupply: async () => {
            throw new Error('ECONNREFUSED');
          },
          getTokenLargestAccounts: async () => {
            throw new Error('ECONNREFUSED');
          },
        },
      }),
    );
    const rpc = fetchers.find((f) => f.name === 'solana-rpc');
    await expect(rpc!.fetch('solana', MINT)).resolves.toBeNull();
  });

  it('fills totalSupply through the merge when aggregators are null', async () => {
    const fetchers = buildProviderQuoteFetchers(
      stubDeps({
        solanaRpc: {
          getTokenSupply: async () => ({
            amount: '10000000000000000',
            decimals: 6,
            uiAmount: 10000000000,
            uiAmountString: '10000000000',
          }),
          getTokenLargestAccounts: async () => null,
        },
      }),
    );
    const aggregator = new SnapshotAggregatorService();
    const outcome = await aggregator.aggregate('solana', MINT, fetchers);
    expect(outcome.quote.totalSupply).toBe(10000000000);
    expect(outcome.sources).toContain('solana-rpc');
  });
});
