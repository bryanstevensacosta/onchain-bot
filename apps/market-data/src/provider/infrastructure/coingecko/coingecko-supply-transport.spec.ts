import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import axios from 'axios';
import { CoinGeckoService } from './coingecko.service';
import { COINGECKO_CONFIG } from './coingecko.config';
import { buildProviderQuoteFetchers } from '../quote-fetchers/provider-quote.fetchers';

/**
 * Supply-transport repair (dexter plan todo 47): the service used to
 * null-collapse when price AND mcap were both null, discarding
 * already-fetched `total/circulating/max` supply for long-tail tokens
 * CoinGecko tracks without pricing. The gate case is SCRIP
 * (`y95bhwzuu…pump`, solana): `sources: ['dexscreener']`, supply
 * triple-null → FDV N/A, with `solana-rpc/coingecko/birdeye/mobula:
 * no data` (on-chain leg 429-walled, CoinGecko 404s the mint itself —
 * evidence `.omo/evidence/task-fe-supply-fallback.log`).
 *
 * Fixtures-first: every spec below pins the transport on verbatim
 * response shapes (no live calls). Quota proof: zero new calls — the
 * repair only transports the SAME single response wider (spec asserts
 * exactly one GET per `getTokenContractInfo`).
 */
const MINT = 'y95bhwzuuapjj9gebxfebuzzeccrvw6kqxkqczcpump';

function responseWith(marketData: Record<string, unknown>) {
  return { data: { market_data: marketData, image: null } };
}

async function keyedService(): Promise<CoinGeckoService> {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
    providers: [
      CoinGeckoService,
      { provide: COINGECKO_CONFIG, useValue: { apiKey: 'test-key' } },
    ],
  }).compile();
  return module.get(CoinGeckoService);
}

async function keylessService(): Promise<CoinGeckoService> {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
    providers: [
      CoinGeckoService,
      { provide: COINGECKO_CONFIG, useValue: { apiKey: '' } },
    ],
  }).compile();
  return module.get(CoinGeckoService);
}

describe('CoinGecko supply transport (todo 47: no supply discard)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('transports a supply-only row (price+mcap null, total+max present)', async () => {
    const service = await keyedService();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue(
      responseWith({
        current_price: { usd: null },
        market_cap: { usd: null },
        fully_diluted_valuation: { usd: null },
        total_volume: { usd: null },
        price_change_percentage_24h: null,
        total_supply: 1_000_000_000,
        circulating_supply: null,
        max_supply: 1_000_000_000,
      }),
    );
    const info = await service.getTokenContractInfo('solana', MINT);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(info).not.toBeNull();
    expect(info?.totalSupply).toBe(1_000_000_000);
    expect(info?.maxSupply).toBe(1_000_000_000);
    expect(info?.circulatingSupply).toBeNull();
    expect(info?.priceUsd).toBeNull();
    expect(info?.marketCapUsd).toBeNull();
  });

  it('keeps the price-only contract byte-identical', async () => {
    const service = await keyedService();
    jest.spyOn(axios, 'get').mockResolvedValue(
      responseWith({
        current_price: { usd: 3.171e-6 },
        market_cap: { usd: 2973 },
        fully_diluted_valuation: { usd: 3171 },
        total_volume: { usd: 392683.26 },
        price_change_percentage_24h: -92.75,
        total_supply: null,
        circulating_supply: null,
        max_supply: null,
      }),
    );
    const info = await service.getTokenContractInfo('solana', MINT);
    expect(info?.priceUsd).toBe(3.171e-6);
    expect(info?.marketCapUsd).toBe(2973);
    expect(info?.totalSupply).toBeNull();
  });

  it('keeps a full row unchanged', async () => {
    const service = await keyedService();
    jest.spyOn(axios, 'get').mockResolvedValue(
      responseWith({
        current_price: { usd: 1.5 },
        market_cap: { usd: 1_400_000 },
        fully_diluted_valuation: { usd: 1_500_000 },
        total_volume: { usd: 10_000 },
        price_change_percentage_24h: 2.5,
        total_supply: 1_000_000,
        circulating_supply: 900_000,
        max_supply: 1_000_000,
      }),
    );
    const info = await service.getTokenContractInfo('solana', MINT);
    expect(info).toEqual({
      priceUsd: 1.5,
      marketCapUsd: 1_400_000,
      fdvUsd: 1_500_000,
      volumeUsdH24: 10_000,
      priceChangePercent24h: 2.5,
      totalSupply: 1_000_000,
      circulatingSupply: 900_000,
      maxSupply: 1_000_000,
      imageUrls: [],
    });
  });

  it('still null-collapses when EVERY mapped field is null (no-data contract)', async () => {
    const service = await keyedService();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue(
      responseWith({
        current_price: { usd: null },
        market_cap: { usd: null },
        fully_diluted_valuation: { usd: null },
        total_volume: { usd: null },
        price_change_percentage_24h: null,
        total_supply: null,
        circulating_supply: null,
        max_supply: null,
      }),
    );
    await expect(
      service.getTokenContractInfo('solana', MINT),
    ).resolves.toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('still returns null without market_data', async () => {
    const service = await keyedService();
    jest.spyOn(axios, 'get').mockResolvedValue({ data: {} });
    await expect(
      service.getTokenContractInfo('solana', MINT),
    ).resolves.toBeNull();
  });

  it('keyless returns null without network (skip intact)', async () => {
    const keyless = await keylessService();
    const spy = jest.spyOn(axios, 'get');
    await expect(
      keyless.getTokenContractInfo('solana', MINT),
    ).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetcher transports supply-only info into the merge (no reorder)', async () => {
    const fetchers = buildProviderQuoteFetchers({
      dexscreener: { getBestPairSummaryForChain: async () => null },
      geckoterminal: { getTokenInfo: async () => null },
      birdeye: { getTokenOverview: async () => null },
      ccxt: { fetchTicker: async () => null, defaultExchange: 'binance' },
      coingecko: {
        getTokenContractInfo: async () => ({
          priceUsd: null,
          marketCapUsd: null,
          fdvUsd: null,
          volumeUsdH24: null,
          priceChangePercent24h: null,
          totalSupply: 1_000_000_000,
          circulatingSupply: null,
          maxSupply: 1_000_000_000,
          imageUrls: [],
        }),
      },
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
    } as never);
    // Fetcher order pinned (todo 47 prohibition: reorder would silently
    // change multi-hit winners) — coingecko stays after birdeye.
    const names = fetchers.map((fetcher) => fetcher.name);
    expect(names.indexOf('coingecko')).toBeGreaterThan(
      names.indexOf('birdeye'),
    );
    const coingecko = fetchers.find((fetcher) => fetcher.name === 'coingecko');
    const quote = await coingecko?.fetch('solana', MINT);
    expect(quote?.totalSupply).toBe(1_000_000_000);
    expect(quote?.maxSupply).toBe(1_000_000_000);
  });
});
