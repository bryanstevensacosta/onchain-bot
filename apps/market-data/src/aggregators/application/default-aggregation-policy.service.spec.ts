import { DefaultAggregationPolicyService } from './default-aggregation-policy.service';
import {
  AggregationPolicyPort,
  type AggregationPolicyContext,
  type PolicyFetcherView,
} from '../domain/aggregation-policy.port';

const SOL = 'So11111111111111111111111111111111111111112';

function fetcher(
  name: string,
  extra: Partial<PolicyFetcherView> = {},
): PolicyFetcherView {
  return {
    name,
    supportsChains: ['solana', 'ethereum'],
    ...extra,
  };
}

function ctx(
  overrides: Partial<AggregationPolicyContext> = {},
): AggregationPolicyContext {
  return {
    kind: 'token',
    chain: 'solana',
    address: SOL,
    fields: ['priceUsd', 'marketCapUsd'],
    quota: {},
    credits: {},
    ...overrides,
  };
}

/**
 * Failing-first (market-data restructure): the aggregation policy owns
 * the ordered provider list. Default preserves the builder order
 * (ccxt-first where it covers comes from the fetcher builder) and only
 * deprioritizes quota-exhausted / zero-credit providers — empty
 * quota/credits is the identity, so the pipeline order is unchanged.
 */
describe('DefaultAggregationPolicyService (ordered provider list)', () => {
  const policy = new DefaultAggregationPolicyService();

  it('exposes the policy through its port token', () => {
    expect(policy).toBeInstanceOf(AggregationPolicyPort);
  });

  it('is the identity with empty quota/credits (ccxt-first preserved)', () => {
    const input = [
      fetcher('ccxt', { covers: (_chain, address) => address.includes('/') }),
      fetcher('dexscreener'),
      fetcher('geckoterminal'),
    ];
    expect(policy.orderFetchers(input, ctx()).map((f) => f.name)).toEqual([
      'ccxt',
      'dexscreener',
      'geckoterminal',
    ]);
  });

  it('moves quota-exhausted providers last, stable otherwise', () => {
    const input = [
      fetcher('dexscreener'),
      fetcher('geckoterminal'),
      fetcher('birdeye'),
    ];
    const ordered = policy.orderFetchers(
      input,
      ctx({ quota: { dexscreener: { exhausted: true } } }),
    );
    expect(ordered.map((f) => f.name)).toEqual([
      'geckoterminal',
      'birdeye',
      'dexscreener',
    ]);
  });

  it('moves zero-credit providers last', () => {
    const input = [fetcher('coingecko'), fetcher('mobula')];
    const ordered = policy.orderFetchers(
      input,
      ctx({ credits: { coingecko: 0 } }),
    );
    expect(ordered.map((f) => f.name)).toEqual(['mobula', 'coingecko']);
  });

  it('ignores quota entries for unknown providers', () => {
    const input = [fetcher('dexscreener')];
    const ordered = policy.orderFetchers(
      input,
      ctx({ quota: { ghost: { exhausted: true } }, credits: { ghost: 0 } }),
    );
    expect(ordered.map((f) => f.name)).toEqual(['dexscreener']);
  });

  it('never drops chain-unsupported fetchers (eligibility stays with the aggregator)', () => {
    const input = [fetcher('moralis')];
    const ordered = policy.orderFetchers(
      input,
      ctx({ chain: 'solana' }),
    );
    expect(ordered).toHaveLength(1);
  });
});
