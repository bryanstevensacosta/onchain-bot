import { buildProviderQuoteFetchers } from './provider-quote.fetchers';
import { selectPoolQuote } from 'provider/infrastructure/geckoterminal';

/**
 * Failing-first: GeckoTerminal network coverage (dexter plan todo 25).
 *
 * Fixtures shaped from live `api.geckoterminal.com` captures 2026-10-06:
 * STAGEVEIL `0xcf7f…f3597` on `robinhood` (token `/info` carries
 * identity + holders with null price/fdv; the `0x9269…ef60` pool
 * carries `fdv_usd: 3471.764926` with the highest reserve).
 */
describe('provider-quote fetchers (gecko networks)', () => {
  const STAGEVEIL = '0xcf7f57cd2924d5c34758a3363b0fb237687f3597';
  const POOL =
    '0x9269be45b3b5e1526db43b8b5be282ac97fde1214e8a7e0cf75362dad4eeef60';

  function stageveilInfo() {
    return {
      address: STAGEVEIL,
      name: 'STAGEVEIL',
      symbol: 'SVEIL',
      totalSupply: null,
      decimals: 18,
      holders: 58,
      top10HolderPercent: null,
      gtScore: 33.97,
      priceUsd: null,
      fdvUsd: null,
      marketCapUsd: null,
      volumeUsdH24: null,
      priceChangePercentH24: null,
    };
  }

  function stageveilPools() {
    const rel = (base: string, quote: string) => ({
      base_token: { data: { id: `robinhood_${base}` } },
      quote_token: { data: { id: `robinhood_${quote}` } },
    });
    const weth = '0x0000000000000000000000000000000000000000';
    return [
      {
        id: `robinhood_${POOL}`,
        type: 'pool',
        attributes: {
          address: POOL,
          base_token_price_usd: '0.000003471764926',
          quote_token_price_usd: '2692.72',
          fdv_usd: '3471.764926',
          reserve_in_usd: '5737.1871',
        },
        relationships: rel(STAGEVEIL, weth),
      },
      {
        id: 'robinhood_0xa1f8ea49804d57001acfe5c99d31a953bf5d034194e4bc9401dcee48edf56752',
        type: 'pool',
        attributes: {
          address:
            '0xa1f8ea49804d57001acfe5c99d31a953bf5d034194e4bc9401dcee48edf56752',
          base_token_price_usd: '0.00001128667435',
          quote_token_price_usd: '2687.23',
          fdv_usd: '11286.67435',
          reserve_in_usd: '1.0753',
        },
        relationships: rel(STAGEVEIL, weth),
      },
    ];
  }

  function deps(overrides: Record<string, unknown> = {}) {
    return {
      dexscreener: { getBestPairSummaryForChain: async () => null },
      geckoterminal: {
        getTokenInfo: async () => stageveilInfo(),
        getTokenPools: async () => stageveilPools(),
      },
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

  function gecko(d: ReturnType<typeof deps>) {
    return buildProviderQuoteFetchers(d).find(
      (f) => f.name === 'geckoterminal',
    )!;
  }

  it('supports the 7 snapshot-addressable chains (arb/poly/robinhood included)', () => {
    expect(gecko(deps()).supportsChains).toEqual([
      'ethereum',
      'solana',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
      'robinhood',
    ]);
  });

  it('robinhood resolves via the pool with live FDV ~$3471', async () => {
    const calls: Array<[string, string]> = [];
    const d = deps({
      geckoterminal: {
        getTokenInfo: async (slug: string, addr: string) => {
          calls.push([slug, addr]);
          return stageveilInfo();
        },
        getTokenPools: async (slug: string, addr: string) => {
          calls.push([`pools:${slug}`, addr]);
          return stageveilPools();
        },
      },
    });
    const quote = await gecko(d).fetch('robinhood', STAGEVEIL);
    expect(calls).toEqual([
      ['robinhood', STAGEVEIL],
      ['pools:robinhood', STAGEVEIL],
    ]);
    expect(quote?.symbol).toBe('SVEIL');
    expect(quote?.holders).toBe(58);
    expect(quote?.fdvUsd).toBeCloseTo(3471.764926, 4);
    expect(quote?.priceUsd).toBeCloseTo(0.000003471764926, 12);
  });

  it('maps audited slugs 1:1 (optimism, unichain)', async () => {
    const seen: string[] = [];
    const d = deps({
      geckoterminal: {
        getTokenInfo: async (slug: string) => {
          seen.push(slug);
          return null;
        },
      },
    });
    await gecko(d).fetch('optimism', STAGEVEIL);
    await gecko(d).fetch('unichain', STAGEVEIL);
    expect(seen).toEqual(['optimism', 'unichain']);
  });

  it('unmapped network keeps prior behavior (raw chain, null, no crash)', async () => {
    const seen: string[] = [];
    const d = deps({
      geckoterminal: {
        getTokenInfo: async (slug: string) => {
          seen.push(slug);
          return null;
        },
      },
    });
    await expect(gecko(d).fetch('linea', STAGEVEIL)).resolves.toBeNull();
    expect(seen).toEqual(['linea']);
  });

  it('skips the pool call when token info already has price + fdv', async () => {
    let poolsCalled = 0;
    const d = deps({
      geckoterminal: {
        getTokenInfo: async () => ({
          ...stageveilInfo(),
          priceUsd: 1.5,
          fdvUsd: 200,
        }),
        getTokenPools: async () => {
          poolsCalled += 1;
          return stageveilPools();
        },
      },
    });
    const quote = await gecko(d).fetch('robinhood', STAGEVEIL);
    expect(poolsCalled).toBe(0);
    expect(quote?.fdvUsd).toBe(200);
    expect(quote?.priceUsd).toBe(1.5);
  });

  it('tolerates a service without getTokenPools (legacy stubs)', async () => {
    const d = deps({
      geckoterminal: { getTokenInfo: async () => stageveilInfo() },
    });
    const quote = await gecko(d).fetch('robinhood', STAGEVEIL);
    expect(quote?.symbol).toBe('SVEIL');
    expect(quote?.fdvUsd).toBeNull();
  });

  it('pool miss keeps the token-info quote (fail-open)', async () => {
    for (const pools of [null, [], async () => null]) {
      const d = deps({
        geckoterminal: {
          getTokenInfo: async () => stageveilInfo(),
          getTokenPools:
            typeof pools === 'function' ? pools : async () => pools,
        },
      });
      const quote = await gecko(d).fetch('robinhood', STAGEVEIL);
      expect(quote?.symbol).toBe('SVEIL');
      expect(quote?.fdvUsd).toBeNull();
    }
  });

  it('token-info miss stays null even with pools (no phantom tokens)', async () => {
    const d = deps({
      geckoterminal: {
        getTokenInfo: async () => null,
        getTokenPools: async () => stageveilPools(),
      },
    });
    await expect(gecko(d).fetch('robinhood', STAGEVEIL)).resolves.toBeNull();
  });

  describe('selectPoolQuote', () => {
    it('picks highest reserve, not highest fdv (dead pools lose)', () => {
      const pick = selectPoolQuote(stageveilPools(), STAGEVEIL);
      expect(pick?.fdvUsd).toBeCloseTo(3471.764926, 4);
    });

    it('quote-side token takes price but never fdv', () => {
      const weth = '0x0000000000000000000000000000000000000000';
      const pick = selectPoolQuote(stageveilPools(), weth);
      expect(pick?.fdvUsd).toBeNull();
      expect(pick?.priceUsd).toBeCloseTo(2692.72, 2);
    });

    it('foreign address and garbage resolve null, never throw', () => {
      expect(
        selectPoolQuote(
          stageveilPools(),
          '0xdead000000000000000000000000000000000000',
        ),
      ).toBeNull();
      expect(selectPoolQuote(null, STAGEVEIL)).toBeNull();
      expect(selectPoolQuote(undefined, STAGEVEIL)).toBeNull();
      expect(selectPoolQuote('nope' as never, STAGEVEIL)).toBeNull();
      expect(selectPoolQuote(stageveilPools(), '')).toBeNull();
    });
  });
});
