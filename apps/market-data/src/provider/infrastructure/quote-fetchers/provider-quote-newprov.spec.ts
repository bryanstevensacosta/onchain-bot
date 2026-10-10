import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import { DefiLlamaService } from 'provider/infrastructure/defillama';
import { EtherscanService } from 'provider/infrastructure/etherscan';
import { buildProviderQuoteFetchers } from './provider-quote.fetchers';

/**
 * New-provider legs (dexter plan todo 32): DeFiLlama (last free leg)
 * + Etherscan (last leg overall) — fallback-after-incumbents.
 *
 * Precedence rule (pinned): the merge is first-non-null in ORDER, so
 * these legs only fill gaps every incumbent leaves. QPS math (30a
 * precedent): worst case per cold explicit-chain snapshot = 1
 * DeFiLlama call + 1 Etherscan call, both inside their 60/min buckets
 * (retry cap x2 per 19b2).
 */
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

function stubDeps(overrides: Record<string, unknown> = {}) {
  return {
    dexscreener: { getBestPairSummaryForChain: async () => null },
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

describe('new-provider legs (todo 32: defillama + etherscan last)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('places defillama last-free and etherscan last-overall (precedence pinned)', () => {
    const names = buildProviderQuoteFetchers(
      stubDeps({
        defillama: { getPrice: async () => null },
        etherscan: { getTokenHolderCount: async () => null },
      }),
    ).map((fetcher) => fetcher.name);
    expect(names).toEqual([
      'ccxt',
      'dexscreener',
      'geckoterminal',
      'solana-rpc',
      'rugcheck',
      'defillama',
      'birdeye',
      'coingecko',
      'mobula',
      'moralis',
      'etherscan',
    ]);
  });

  it('skips both legs silently when the services are absent (byte-identical for old callers)', async () => {
    const fetchers = buildProviderQuoteFetchers(stubDeps());
    const aggregator = new SnapshotAggregatorService();
    const outcome = await aggregator.aggregate('ethereum', WETH, fetchers);
    expect(outcome.allFailed).toBe(true);
    expect(outcome.sources).toEqual([]);
  });

  it('defillama fills price gaps incumbents leave (price + mint-bound symbol only)', async () => {
    const fetchers = buildProviderQuoteFetchers(
      stubDeps({
        defillama: {
          getPrice: async () => ({ price: 2482.25, symbol: 'WETH' }),
        },
      }),
    );
    const aggregator = new SnapshotAggregatorService();
    const outcome = await aggregator.aggregate('ethereum', WETH, fetchers);
    expect(outcome.quote.priceUsd).toBe(2482.25);
    expect(outcome.quote.symbol).toBe('WETH');
    expect(outcome.quote.fdvUsd).toBeNull();
    expect(outcome.quote.liquidityUsd).toBeNull();
    expect(outcome.sources).toEqual(['defillama']);
  });

  it('etherscan fills holder gaps with the exact count (keyed service, mocked)', async () => {
    const fetchers = buildProviderQuoteFetchers(
      stubDeps({ etherscan: { getTokenHolderCount: async () => 12345 } }),
    );
    const aggregator = new SnapshotAggregatorService();
    const outcome = await aggregator.aggregate('ethereum', WETH, fetchers);
    expect(outcome.quote.holders).toBe(12345);
    expect(outcome.sources).toEqual(['etherscan']);
  });

  it('etherscan skips zero-network without a key (real keyless service)', async () => {
    const fetchers = buildProviderQuoteFetchers(
      stubDeps({ etherscan: new EtherscanService({ apiKey: '' }) }),
    );
    const aggregator = new SnapshotAggregatorService();
    const outcome = await aggregator.aggregate('ethereum', WETH, fetchers);
    expect(outcome.quote.holders).toBeNull();
    expect(outcome.sources).toEqual([]);
  });

  it('new legs never outrank incumbents (first-non-null order wins)', async () => {
    const fetchers = buildProviderQuoteFetchers(
      stubDeps({
        dexscreener: {
          getBestPairSummaryForChain: async () => ({
            priceUsd: '9.99',
            marketCap: null,
            fdv: null,
            liquidityUsd: null,
            volume24h: null,
            priceChange24h: null,
            baseToken: { address: WETH, symbol: 'DEX', name: 'Dex' },
            quoteToken: { address: null, symbol: null, name: null },
          }),
        },
        defillama: {
          getPrice: async () => ({ price: 1.0, symbol: 'LLAMA' }),
        },
      }),
    );
    const aggregator = new SnapshotAggregatorService();
    const outcome = await aggregator.aggregate('ethereum', WETH, fetchers);
    expect(outcome.quote.priceUsd).toBe(9.99);
    expect(outcome.quote.symbol).toBe('DEX');
    expect(outcome.sources).toEqual(['dexscreener']);
  });

  it('QPS math as test: at most 1 call per leg per cold scan (inside 60/min buckets)', async () => {
    const getPrice = jest.fn(async () => null);
    const getTokenHolderCount = jest.fn(async () => null);
    const fetchers = buildProviderQuoteFetchers(
      stubDeps({
        defillama: { getPrice } as unknown as DefiLlamaService,
        etherscan: { getTokenHolderCount } as unknown as EtherscanService,
      }),
    );
    const aggregator = new SnapshotAggregatorService();
    await aggregator.aggregate('ethereum', WETH, fetchers);
    // 1 price call (defillama covers ethereum) + 1 holders call
    // (etherscan covers ethereum) — worst case 2 calls/scan, each
    // inside its own 60/min bucket (retry x2 max per 19b2).
    expect(getPrice).toHaveBeenCalledTimes(1);
    expect(getTokenHolderCount).toHaveBeenCalledTimes(1);
    await aggregator.aggregate(
      'solana',
      'So11111111111111111111111111111111111111112',
      fetchers,
    );
    // solana: defillama fires (supported), etherscan skips (non-EVM).
    expect(getPrice).toHaveBeenCalledTimes(2);
    expect(getTokenHolderCount).toHaveBeenCalledTimes(1);
  });
});
