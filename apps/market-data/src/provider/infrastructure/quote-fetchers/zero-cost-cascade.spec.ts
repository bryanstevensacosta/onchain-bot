import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { CoinGeckoService } from 'provider/infrastructure/coingecko';
import { MobulaService } from 'provider/infrastructure/mobula';
import { MoralisService } from 'provider/infrastructure/moralis';
import {
  QUOTE_FETCHER_COST_TIER,
  buildProviderQuoteFetchers,
} from './provider-quote.fetchers';

/**
 * Zero-cost cascade spec (Tramo 3, consumer-probe).
 *
 * Pins the 24/7 $0 invariant: free providers (no key) run first
 * ordered by coverage, keyed providers are fallback-only and skip
 * without keys — never throwing, never a 401-crash. Keyless adapter
 * checks use the REAL services with an empty key and assert null
 * without any network (every keyed method gates on the key first).
 */
function stubDeps(overrides: Record<string, unknown> = {}): never {
  return {
    dexscreener: { getBestPairSummary: async () => null },
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

describe('zero-cost cascade (free-first, keyed fallback)', () => {
  it('orders every free fetcher before every keyed fetcher', () => {
    const fetchers = buildProviderQuoteFetchers(stubDeps());
    const names = fetchers.map((fetcher) => fetcher.name);
    const lastFree = Math.max(
      ...names
        .filter((name) => QUOTE_FETCHER_COST_TIER[name] === 'free')
        .map((name) => names.indexOf(name)),
    );
    const firstKeyed = Math.min(
      ...names
        .filter((name) => QUOTE_FETCHER_COST_TIER[name] === 'keyed')
        .map((name) => names.indexOf(name)),
    );
    expect(lastFree).toBeLessThan(firstKeyed);
  });

  it('classifies every fetcher in the cost-tier map', () => {
    const fetchers = buildProviderQuoteFetchers(stubDeps());
    for (const fetcher of fetchers) {
      expect(QUOTE_FETCHER_COST_TIER[fetcher.name]).toBeDefined();
    }
    expect(Object.keys(QUOTE_FETCHER_COST_TIER).sort()).toEqual(
      fetchers.map((fetcher) => fetcher.name).sort(),
    );
  });

  it('aggregates all-null without throwing when no key is present', async () => {
    const fetchers = buildProviderQuoteFetchers(stubDeps());
    const aggregator = new SnapshotAggregatorService();
    const outcome = await aggregator.aggregate(
      'solana',
      'So11111111111111111111111111111111111111112',
      fetchers,
    );
    expect(outcome.allFailed).toBe(true);
    expect(outcome.sources).toEqual([]);
    expect(outcome.quote.priceUsd).toBeNull();
  });

  it('skips keyed adapters without keys — never throws, never 401-crashes', async () => {
    const birdeye = new BirdeyeService({ apiKey: '' });
    const moralis = new MoralisService({ apiKey: '' });
    const coingecko = new CoinGeckoService({ apiKey: '' });
    const mobula = new MobulaService({ apiKey: '' });
    await expect(
      birdeye.getTokenOverview('So11111111111111111111111111111111111111112'),
    ).resolves.toBeNull();
    await expect(
      birdeye.getTokenPrice('So11111111111111111111111111111111111111112'),
    ).resolves.toBeNull();
    await expect(
      moralis.getTokenAnalytics(
        '0x026c029ac3395a893784fe6f3aece2bfc613ffff',
        'bsc',
      ),
    ).resolves.toBeNull();
    await expect(
      moralis.getTokenHolders(
        '0x026c029ac3395a893784fe6f3aece2bfc613ffff',
        'bsc',
      ),
    ).resolves.toBeNull();
    await expect(
      coingecko.getTokenContractInfo(
        'binance-smart-chain',
        '0x026c029ac3395a893784fe6f3aece2bfc613ffff',
      ),
    ).resolves.toBeNull();
    await expect(
      mobula.getTokenMarkets(
        '0x026c029ac3395a893784fe6f3aece2bfc613ffff',
        'bsc',
      ),
    ).resolves.toBeNull();
  });
});
