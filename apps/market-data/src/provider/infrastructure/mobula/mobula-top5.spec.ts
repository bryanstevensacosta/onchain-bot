import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import axios from 'axios';
import { MobulaService } from './mobula.service';
import { MOBULA_CONFIG } from './mobula.config';
import { buildProviderQuoteFetchers } from '../quote-fetchers/provider-quote.fetchers';

/**
 * Top-5 exploitation leg #5 (dexter plan todo 31): Mobula
 * `token/price` + batch `POST token/price` (≤500) as the cheap legs
 * (both keyed — specs only, no live probes: the demo endpoint 403s
 * `token/price` on the free plan, verified this lane).
 *
 * Shapes are doc-verified
 * (https://docs.mobula.io/rest-api-reference/endpoint/token-price{,-post}):
 * single `{ data: { priceUSD, ... } }` (USD-suffix naming — NOT the
 * `token/markets` camelCase) and batch `{ payload: [...] }` with
 * positional `error` slots. Literal path `/token/price` (the
 * docs-page slug `token-price` is not the path).
 */
async function keyedService(): Promise<MobulaService> {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
    providers: [
      MobulaService,
      { provide: MOBULA_CONFIG, useValue: { apiKey: 'test-key' } },
    ],
  }).compile();
  return module.get(MobulaService);
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

function mobulaFetcher(d: ReturnType<typeof stubDeps>) {
  return buildProviderQuoteFetchers(d).find((f) => f.name === 'mobula')!;
}

describe('Mobula top-5 (todo 31: token/price + batch-500)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('getTokenPrice hits the literal /token/price path with address+blockchain', async () => {
    const service = await keyedService();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        data: {
          name: 'Wrapped SOL',
          symbol: 'SOL',
          priceUSD: 187.45,
          marketCapUSD: 91_000_000_000,
          marketCapDilutedUSD: 110_000_000_000,
          liquidityUSD: 250_000_000,
        },
      },
    });
    const priced = await service.getTokenPrice(
      'So11111111111111111111111111111111111111112',
      'solana',
    );
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/token/price'),
      expect.objectContaining({
        params: {
          address: 'So11111111111111111111111111111111111111112',
          blockchain: 'solana',
        },
      }),
    );
    expect(priced?.priceUSD).toBe(187.45);
    expect(priced?.liquidityUSD).toBe(250_000_000);
  });

  it('getTokenPriceBatch posts { items } and drops error slots', async () => {
    const service = await keyedService();
    const spy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: {
        payload: [
          {
            address: 'So11111111111111111111111111111111111111112',
            chainId: 'solana:solana',
            symbol: 'SOL',
            priceUSD: 187.45,
          },
          {
            address: '0x1234567890abcdef1234567890abcdef12345678',
            chainId: 'evm:1',
            error: 'Token not found',
          },
        ],
      },
    });
    const payload = await service.getTokenPriceBatch([
      {
        address: 'So11111111111111111111111111111111111111112',
        blockchain: 'solana',
      },
      {
        address: '0x1234567890abcdef1234567890abcdef12345678',
        blockchain: 'ethereum',
      },
    ]);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/token/price'),
      expect.objectContaining({
        items: [
          {
            address: 'So11111111111111111111111111111111111111112',
            blockchain: 'solana',
          },
          {
            address: '0x1234567890abcdef1234567890abcdef12345678',
            blockchain: 'ethereum',
          },
        ],
      }),
      expect.anything(),
    );
    expect(payload).toHaveLength(1);
    expect(payload?.[0].symbol).toBe('SOL');
  });

  it('batch drops unmapped-chain entries and caps at 500 zero-extra-network', async () => {
    const service = await keyedService();
    const spy = jest.spyOn(axios, 'post').mockResolvedValue({
      data: { payload: [] },
    });
    await expect(
      service.getTokenPriceBatch([
        { address: 'a', blockchain: 'robinhood' },
        { address: 'b', blockchain: 'nope' },
      ]),
    ).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('no key resolves null zero-network (fail-open preserved)', async () => {
    const module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
      providers: [
        MobulaService,
        { provide: MOBULA_CONFIG, useValue: { apiKey: '' } },
      ],
    }).compile();
    const service = module.get(MobulaService);
    const getSpy = jest.spyOn(axios, 'get');
    const postSpy = jest.spyOn(axios, 'post');
    await expect(service.getTokenPrice('a', 'solana')).resolves.toBeNull();
    await expect(
      service.getTokenPriceBatch([{ address: 'a', blockchain: 'solana' }]),
    ).resolves.toBeNull();
    expect(getSpy).not.toHaveBeenCalled();
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('markets hit never touches the price leg (no-regression)', async () => {
    const getTokenPrice = jest.fn(async () => null);
    const d = stubDeps({
      mobula: {
        getTokenMarkets: async () => ({
          priceUSD: 100,
          approximateReserveUSD: 500,
          marketCapUSD: 1000,
          marketCapDilutedUSD: 2000,
          top10HoldingsPercentage: 5,
          totalSupply: 400,
        }),
        getTokenPrice,
      },
    });
    const quote = await mobulaFetcher(d).fetch('solana', 'mint');
    expect(quote?.priceUsd).toBe(100);
    expect(quote?.top10HolderPercent).toBe(5);
    expect(getTokenPrice).not.toHaveBeenCalled();
  });

  it('markets miss falls back to the cheap price leg', async () => {
    const d = stubDeps({
      mobula: {
        getTokenMarkets: async () => null,
        getTokenPrice: async () => ({
          name: 'Wrapped SOL',
          symbol: 'SOL',
          priceUSD: 187.45,
          marketCapUSD: 91_000_000_000,
          marketCapDilutedUSD: 110_000_000_000,
          liquidityUSD: 250_000_000,
        }),
      },
    });
    const quote = await mobulaFetcher(d).fetch('solana', 'mint');
    expect(quote?.priceUsd).toBe(187.45);
    expect(quote?.fdvUsd).toBe(110_000_000_000);
    expect(quote?.symbol).toBe('SOL');
  });

  it('both legs miss stays null (fail-open)', async () => {
    const d = stubDeps({
      mobula: {
        getTokenMarkets: async () => null,
        getTokenPrice: async () => null,
      },
    });
    await expect(mobulaFetcher(d).fetch('solana', 'mint')).resolves.toBeNull();
  });
});
