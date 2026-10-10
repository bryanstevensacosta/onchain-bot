import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import axios from 'axios';
import { GeckoTerminalService } from './geckoterminal.service';
import {
  GECKOTERMINAL_CONFIG,
  type GeckoTerminalConfig,
} from './geckoterminal.config';
import { buildProviderQuoteFetchers } from '../quote-fetchers/provider-quote.fetchers';

/**
 * Top-5 exploitation leg #2 (dexter plan todo 31): GeckoTerminal
 * `search/pools` + `tokens/multi` + `simple/token_price` (all keyless,
 * ~10-30/min — each fires ONLY on the previous leg's null).
 *
 * Fixtures are byte-faithful to live captures (this lane, 2026-10-09):
 * SOL `So111…1112` on `solana` (multi token rows, simple price map).
 */
const SOL = 'So11111111111111111111111111111111111111112';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function realService(): Promise<GeckoTerminalService> {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
    providers: [
      GeckoTerminalService,
      { provide: GECKOTERMINAL_CONFIG, useValue: {} as GeckoTerminalConfig },
    ],
  }).compile();
  return module.get(GeckoTerminalService);
}

function stubDeps(overrides: Record<string, unknown> = {}) {
  return {
    dexscreener: { getBestPairSummaryForChain: async () => null },
    geckoterminal: {
      getTokenInfo: async () => null,
      getTokenPools: async () => null,
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

function geckoFetcher(d: ReturnType<typeof stubDeps>) {
  return buildProviderQuoteFetchers(d).find((f) => f.name === 'geckoterminal')!;
}

function fullInfo() {
  return {
    address: SOL,
    name: 'Wrapped SOL',
    symbol: 'SOL',
    totalSupply: '12458123392728908.0',
    decimals: 9,
    holders: 100,
    top10HolderPercent: 5,
    gtScore: 90,
    priceUsd: 109.5,
    fdvUsd: 1_000_000,
    marketCapUsd: 900_000,
    volumeUsdH24: 50_000,
    priceChangePercentH24: 2.5,
  };
}

describe('GeckoTerminal top-5 (todo 31: multi + simple + search)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('getTokensMulti parses the live token-rows shape', async () => {
    const service = await realService();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        data: [
          {
            id: `solana_${SOL}`,
            type: 'token',
            attributes: {
              address: SOL,
              name: 'Wrapped SOL',
              symbol: 'SOL',
              decimals: 9,
              total_supply: '12458123392728908.0',
            },
          },
        ],
      },
    });
    const infos = await service.getTokensMulti('solana', [SOL, USDC]);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(`/networks/solana/tokens/multi/${SOL},${USDC}`),
      expect.anything(),
    );
    expect(infos).toHaveLength(1);
    expect(infos?.[0].symbol).toBe('SOL');
  });

  it('getTokensMulti caps at 30 and skips address-less rows', async () => {
    const service = await realService();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: { data: [{ attributes: { name: 'NoAddress' } }] },
    });
    const addrs = Array.from({ length: 35 }, (_, i) => `addr${i}`);
    await expect(service.getTokensMulti('solana', addrs)).resolves.toBeNull();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(`/tokens/multi/${addrs.slice(0, 30).join(',')}`),
      expect.anything(),
    );
    await expect(service.getTokensMulti('solana', [])).resolves.toBeNull();
  });

  it('getSimpleTokenPrice parses the live token_prices map', async () => {
    const service = await realService();
    jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        data: {
          id: '1590837b-1a06-4ceb-8723-ace72097efd3',
          type: 'simple_token_price',
          attributes: { token_prices: { [SOL]: '109.500200289269656' } },
        },
      },
    });
    const prices = await service.getSimpleTokenPrice('solana', [SOL]);
    expect(prices?.[SOL.toLowerCase()]).toBeCloseTo(109.5, 2);
  });

  it('searchPools hits /search/pools and rejects blank queries zero-network', async () => {
    const service = await realService();
    const spy = jest
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: { data: [] } });
    await service.searchPools(SOL);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/search/pools'),
      expect.objectContaining({ params: { query: SOL } }),
    );
    spy.mockClear();
    await expect(service.searchPools('   ')).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('info-complete never touches the new legs (no-regression + quota)', async () => {
    const getTokensMulti = jest.fn(async () => null);
    const getSimpleTokenPrice = jest.fn(async () => null);
    const searchPools = jest.fn(async () => null);
    const d = stubDeps({
      geckoterminal: {
        getTokenInfo: async () => fullInfo(),
        getTokenPools: async () => null,
        getTokensMulti,
        getSimpleTokenPrice,
        searchPools,
      },
    });
    const quote = await geckoFetcher(d).fetch('solana', SOL);
    expect(quote?.priceUsd).toBe(109.5);
    expect(getTokensMulti).not.toHaveBeenCalled();
    expect(getSimpleTokenPrice).not.toHaveBeenCalled();
    expect(searchPools).not.toHaveBeenCalled();
  });

  it('info-null resolves via the multi leg', async () => {
    const d = stubDeps({
      geckoterminal: {
        getTokenInfo: async () => null,
        getTokenPools: async () => null,
        getTokensMulti: async () => [fullInfo()],
        getSimpleTokenPrice: async () => null,
        searchPools: jest.fn(async () => null),
      },
    });
    const quote = await geckoFetcher(d).fetch('solana', SOL);
    expect(quote?.symbol).toBe('SOL');
    expect(quote?.priceUsd).toBe(109.5);
  });

  it('info + multi null resolve via the search leg (pool numbers, no identity)', async () => {
    const searchPools = jest.fn(async () => [
      {
        id: 'solana_pool',
        type: 'pool',
        attributes: {
          address: 'pool',
          base_token_price_usd: '109.52',
          quote_token_price_usd: '1.0',
          fdv_usd: '999999',
          reserve_in_usd: '5000',
        },
        relationships: {
          base_token: { data: { id: `solana_${SOL}` } },
          quote_token: { data: { id: `solana_${USDC}` } },
        },
      },
    ]);
    const d = stubDeps({
      geckoterminal: {
        getTokenInfo: async () => null,
        getTokenPools: async () => null,
        getTokensMulti: async () => null,
        getSimpleTokenPrice: async () => null,
        searchPools,
      },
    });
    const quote = await geckoFetcher(d).fetch('solana', SOL);
    expect(quote?.priceUsd).toBeCloseTo(109.52, 2);
    expect(quote?.fdvUsd).toBe(999999);
    expect(quote?.symbol).toBeUndefined();
  });

  it('price-gap fills via the simple leg after pools miss', async () => {
    const getSimpleTokenPrice = jest.fn(async () => ({
      [SOL.toLowerCase()]: 109.51,
    }));
    const d = stubDeps({
      geckoterminal: {
        getTokenInfo: async () => ({ ...fullInfo(), priceUsd: null }),
        getTokenPools: async () => null,
        getTokensMulti: jest.fn(async () => null),
        getSimpleTokenPrice,
        searchPools: jest.fn(async () => null),
      },
    });
    const quote = await geckoFetcher(d).fetch('solana', SOL);
    expect(quote?.priceUsd).toBe(109.51);
    expect(getSimpleTokenPrice).toHaveBeenCalledWith('solana', [SOL]);
  });

  it('all legs null stays null (fail-open)', async () => {
    const d = stubDeps({
      geckoterminal: {
        getTokenInfo: async () => null,
        getTokenPools: async () => null,
        getTokensMulti: async () => null,
        getSimpleTokenPrice: async () => null,
        searchPools: async () => null,
      },
    });
    await expect(geckoFetcher(d).fetch('solana', SOL)).resolves.toBeNull();
  });
});
