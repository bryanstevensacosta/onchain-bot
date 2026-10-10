import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import axios from 'axios';
import { RugCheckService } from './rugcheck.service';
import { RUGCHECK_CONFIG, type RugCheckConfig } from './rugcheck.config';
import { buildProviderQuoteFetchers } from '../quote-fetchers/provider-quote.fetchers';

/**
 * Top-5 exploitation leg #3 (dexter plan todo 31): RugCheck `search`
 * + `stats/new_tokens` (both keyless).
 *
 * Fixtures are byte-faithful to live captures (this lane, 2026-10-09):
 * `GET /v1/search?query=PUMP` (PUMP row: mcap + holders) and
 * `GET /v1/stats/new_tokens` (fresh `...pump` mint rows).
 */
const PUMP = 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn';

async function realService(): Promise<RugCheckService> {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
    providers: [
      RugCheckService,
      {
        provide: RUGCHECK_CONFIG,
        useValue: { baseUrl: 'https://api.rugcheck.xyz/v1' } as RugCheckConfig,
      },
    ],
  }).compile();
  return module.get(RugCheckService);
}

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

function rugcheckFetcher(d: ReturnType<typeof stubDeps>) {
  return buildProviderQuoteFetchers(d).find((f) => f.name === 'rugcheck')!;
}

describe('RugCheck top-5 (todo 31: search + new_tokens)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('search hits /v1/search with the query param (live shape)', async () => {
    const service = await realService();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: [
        {
          mint: PUMP,
          name: 'Pump',
          symbol: 'PUMP',
          verified: true,
          score: 1,
          mcap: 4431639957.6349325,
          holders: 979045,
        },
      ],
    });
    const rows = await service.search('PUMP');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/v1/search'),
      expect.objectContaining({ params: { query: 'PUMP' } }),
    );
    expect(rows).toHaveLength(1);
    expect(rows?.[0].holders).toBe(979045);
  });

  it('search rejects blank queries zero-network', async () => {
    const service = await realService();
    const spy = jest.spyOn(axios, 'get');
    await expect(service.search('   ')).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('getNewTokens hits /v1/stats/new_tokens (live shape)', async () => {
    const service = await realService();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: [
        {
          mint: '5oZU7FxLRsk9nNbPF3yc7u3kew5bMy9UYYfCggHCpump',
          decimals: 6,
          symbol: 'HALH',
          creator: '5LbjPe9YZFtTo7RGN6z6sxCoGzoZW3pqYyweuhBsDMv7',
          createAt: '2026-10-09T19:02:09.957634261Z',
        },
      ],
    });
    const tokens = await service.getNewTokens();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/v1/stats/new_tokens'),
      expect.anything(),
    );
    expect(tokens?.[0].mint).toContain('pump');
  });

  it('summary hit never touches search (no-regression + quota)', async () => {
    const search = jest.fn(async () => null);
    const d = stubDeps({
      rugcheck: {
        getSummary: async () => ({
          tokenProgram: 'p',
          tokenType: 't',
          risks: [],
          lockedLiquidity: [{ amount: 1, percent: 80, tokenAddress: 'x' }],
          totalMarketLiquidity: null,
          totalLPProviders: null,
          totalSupply: null,
          burnedPercent: 10,
        }),
        search,
      },
    });
    const quote = await rugcheckFetcher(d).fetch('solana', PUMP);
    expect(quote?.lockedLiquidityPercent).toBe(80);
    expect(quote?.burnedPercent).toBe(10);
    expect(search).not.toHaveBeenCalled();
  });

  it('summary miss falls back to the exact-mint search row', async () => {
    const d = stubDeps({
      rugcheck: {
        getSummary: async () => null,
        search: async () => [
          { mint: PUMP, symbol: 'PUMP', mcap: 4431639957.63, holders: 979045 },
        ],
      },
    });
    const quote = await rugcheckFetcher(d).fetch('solana', PUMP);
    expect(quote?.holders).toBe(979045);
    expect(quote?.marketCapUsd).toBeCloseTo(4431639957.63, 2);
  });

  it('near-miss search rows are discarded (exact mint only)', async () => {
    const d = stubDeps({
      rugcheck: {
        getSummary: async () => null,
        search: async () => [{ mint: 'OTHER', holders: 5, mcap: 5 }],
      },
    });
    await expect(rugcheckFetcher(d).fetch('solana', PUMP)).resolves.toBeNull();
  });

  it('search miss stays null (fail-open)', async () => {
    const d = stubDeps({
      rugcheck: {
        getSummary: async () => null,
        search: async () => [],
      },
    });
    await expect(rugcheckFetcher(d).fetch('solana', PUMP)).resolves.toBeNull();
  });
});
