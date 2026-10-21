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
  // Live probe 2026-10-21: pump.fun mint on solana — token `/info`
  // carries price+fdv but NO volume/change; its PumpSwap pool carries
  // reserve 2365.4217, volume { h24: '0.0' }, change { h24: '0' },
  // pool_created_at 2026-10-14T12:44:35Z.
  const PUMP_MINT = 'SQ1W9zWdVDgaageGKp228hp2boGRzR3T7iRyd4fpump';
  const PUMP_POOL = 'CSPTGT7oS2Ae8TY2BRjtbBJHNUBprHM8RR3QMUM9nNp2';
  const PUMP_CREATED_MS = Date.parse('2026-10-14T12:44:35.000Z');

  function pumpPool(overrides: Record<string, unknown> = {}) {
    return {
      id: `solana_${PUMP_POOL}`,
      type: 'pool',
      attributes: {
        address: PUMP_POOL,
        base_token_price_usd: '0.000002325209423',
        quote_token_price_usd: '1.0',
        fdv_usd: '2325.21',
        reserve_in_usd: '2365.4217',
        volume_usd: { h24: '0.0' },
        price_change_percentage: { h24: '0' },
        pool_created_at: '2026-10-14T12:44:35Z',
        ...overrides,
      },
      relationships: {
        base_token: { data: { id: `solana_${PUMP_MINT}` } },
        quote_token: {
          data: { id: 'solana_So11111111111111111111111111111111111111112' },
        },
      },
    };
  }

  function pumpPools() {
    return [pumpPool()];
  }

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
      gtCategoryIds: null,
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
          gtCategoryIds: ['pump-fun'],
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
    // Dedicated `/info` writer (todo 72): first non-empty category.
    expect(quote?.geckoLaunchpadHint).toBe('pump-fun');
  });

  it('info with no gt_category_ids carries a null launchpad hint', async () => {
    const d = deps({
      geckoterminal: {
        getTokenInfo: async () => stageveilInfo(),
        getTokenPools: async () => stageveilPools(),
      },
    });
    const quote = await gecko(d).fetch('robinhood', STAGEVEIL);
    expect(quote?.geckoLaunchpadHint).toBeNull();
  });

  it('info-complete path makes ZERO extra calls and carries the hint (todo 72)', async () => {
    const getTokensMulti = jest.fn(async () => null);
    const getSimpleTokenPrice = jest.fn(async () => null);
    const searchPools = jest.fn(async () => null);
    const getTokenPools = jest.fn(async () => null);
    const d = deps({
      geckoterminal: {
        getTokenInfo: async () => ({
          ...stageveilInfo(),
          priceUsd: 1.5,
          fdvUsd: 200,
          gtCategoryIds: ['  pump-fun  ', '', 'other'],
        }),
        getTokenPools,
        getTokensMulti,
        getSimpleTokenPrice,
        searchPools,
      },
    });
    const quote = await gecko(d).fetch('robinhood', STAGEVEIL);
    expect(quote?.geckoLaunchpadHint).toBe('pump-fun');
    expect(getTokenPools).not.toHaveBeenCalled();
    expect(getTokensMulti).not.toHaveBeenCalled();
    expect(getSimpleTokenPrice).not.toHaveBeenCalled();
    expect(searchPools).not.toHaveBeenCalled();
  });

  it('pools fallback carries volume/change (0 preserved), never marketCap', async () => {
    const d = deps({
      geckoterminal: {
        getTokenInfo: async () => stageveilInfo(),
        getTokenPools: async () => pumpPools(),
      },
    });
    const quote = await gecko(d).fetch('solana', PUMP_MINT);
    expect(quote?.priceUsd).toBeCloseTo(0.000002325209423, 12);
    expect(quote?.fdvUsd).toBeCloseTo(2325.21, 2);
    // Positive reserve is liquidity; `0.0` volume / `0` change are REAL
    // readings and survive (never nulled away).
    expect(quote?.liquidityUsd).toBeCloseTo(2365.4217, 4);
    expect(quote?.volume24hUsd).toBe(0);
    expect(quote?.priceChange24h).toBe(0);
    expect(quote?.marketCapUsd).toBeNull();
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

    it('maps the live pump pool market fields on the chosen pool (todo 72)', () => {
      const pick = selectPoolQuote(pumpPools(), PUMP_MINT);
      expect(pick?.liquidityUsd).toBeCloseTo(2365.4217, 4);
      expect(pick?.volume24hUsd).toBe(0);
      expect(pick?.priceChange24h).toBe(0);
      expect(pick?.poolCreatedAtMs).toBe(PUMP_CREATED_MS);
      expect(pick?.side).toBe('base');
    });

    it('quote-side pick NEVER attributes the pool change to our mint', () => {
      const quoteSidePool = {
        ...pumpPool(),
        relationships: {
          base_token: { data: { id: 'solana_other' } },
          quote_token: { data: { id: `solana_${PUMP_MINT}` } },
        },
      };
      const pick = selectPoolQuote([quoteSidePool], PUMP_MINT);
      expect(pick?.side).toBe('quote');
      // Base side is the OTHER token, so the change belongs to it.
      expect(pick?.priceChange24h).toBeNull();
      // Liquidity/fdv rules unchanged: reserve is side-agnostic, fdv is base-only.
      expect(pick?.liquidityUsd).toBeCloseTo(2365.4217, 4);
      expect(pick?.fdvUsd).toBeNull();
    });

    it('zero or missing reserve is not a usable liquidity measurement', () => {
      const zero = selectPoolQuote(
        [pumpPool({ reserve_in_usd: '0.0' })],
        PUMP_MINT,
      );
      expect(zero?.liquidityUsd).toBeNull();
      const missing = selectPoolQuote(
        [pumpPool({ reserve_in_usd: undefined })],
        PUMP_MINT,
      );
      expect(missing?.liquidityUsd).toBeNull();
    });

    it('missing/garbage market fields and negative times resolve null', () => {
      const missing = selectPoolQuote(
        [
          pumpPool({
            volume_usd: undefined,
            price_change_percentage: undefined,
            pool_created_at: undefined,
          }),
        ],
        PUMP_MINT,
      );
      expect(missing?.volume24hUsd).toBeNull();
      expect(missing?.priceChange24h).toBeNull();
      expect(missing?.poolCreatedAtMs).toBeNull();

      const garbage = selectPoolQuote(
        [
          pumpPool({
            volume_usd: { h24: 'garbage' },
            price_change_percentage: { h24: 'nope' },
            pool_created_at: 'not-a-date',
          }),
        ],
        PUMP_MINT,
      );
      expect(garbage?.volume24hUsd).toBeNull();
      expect(garbage?.priceChange24h).toBeNull();
      expect(garbage?.poolCreatedAtMs).toBeNull();

      const negativeTime = selectPoolQuote(
        [pumpPool({ pool_created_at: '1969-12-31T23:59:59.000Z' })],
        PUMP_MINT,
      );
      expect(negativeTime?.poolCreatedAtMs).toBeNull();
    });

    it('non-chosen siblings never leak their volume/change', () => {
      const foreign = {
        ...pumpPool({
          address: 'foreign',
          reserve_in_usd: '999999',
          volume_usd: { h24: '555' },
          price_change_percentage: { h24: '55' },
        }),
        id: 'solana_foreign',
        relationships: {
          base_token: { data: { id: 'solana_other' } },
          quote_token: {
            data: { id: 'solana_So11111111111111111111111111111111111111112' },
          },
        },
      };
      const sibling = {
        ...pumpPool({
          address: 'sibling',
          reserve_in_usd: '1000',
          volume_usd: { h24: '999' },
          price_change_percentage: { h24: '99' },
        }),
        id: 'solana_sibling',
      };
      const pick = selectPoolQuote([foreign, sibling, pumpPool()], PUMP_MINT);
      expect(pick?.poolAddress).toBe(PUMP_POOL);
      expect(pick?.volume24hUsd).toBe(0);
      expect(pick?.priceChange24h).toBe(0);
      expect(pick?.poolCreatedAtMs).toBe(PUMP_CREATED_MS);
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
