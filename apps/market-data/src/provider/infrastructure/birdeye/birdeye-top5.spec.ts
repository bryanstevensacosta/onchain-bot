import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import axios from 'axios';
import {
  BIRDEYE_SUPPORTED_CHAINS,
  BirdeyeService,
  resolveBirdeyeChain,
} from './birdeye.service';
import { BIRDEYE_CONFIG } from './birdeye.config';
import { DEFAULT_PROVIDERS } from '../../domain/provider-descriptor';
import { buildProviderQuoteFetchers } from '../quote-fetchers/provider-quote.fetchers';

/**
 * Top-5 exploitation leg #4 (dexter plan todo 31): Birdeye
 * `supportsChains` widened 1→7 with `x-chain` + `token_security`
 * (all keyed — specs only, no live probes against the key).
 *
 * Honest scope note: the audit's "1→14" assumed chains outside
 * `STATIC_CHAINS` (which has 7 ids: eth/sol/bsc/base/arb/polygon/
 * robinhood). The widen is 1→7 effective chains; `optimism` stays
 * mapped-but-unqueried until the catalog lands, `unichain` is
 * deliberately unmapped (Birdeye lists no such chain).
 */
async function keyedService(): Promise<BirdeyeService> {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
    providers: [
      BirdeyeService,
      { provide: BIRDEYE_CONFIG, useValue: { apiKey: 'test-key' } },
    ],
  }).compile();
  return module.get(BirdeyeService);
}

async function keylessService(): Promise<BirdeyeService> {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
    providers: [
      BirdeyeService,
      { provide: BIRDEYE_CONFIG, useValue: { apiKey: '' } },
    ],
  }).compile();
  return module.get(BirdeyeService);
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

describe('Birdeye top-5 (todo 31: x-chain widen + token_security)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('maps the 7 catalog chains 1:1, optimism for catalog day, unichain null', () => {
    for (const chain of BIRDEYE_SUPPORTED_CHAINS) {
      expect(resolveBirdeyeChain(chain)).toBe(chain);
    }
    expect(BIRDEYE_SUPPORTED_CHAINS).toEqual([
      'solana',
      'ethereum',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
      'robinhood',
    ]);
    expect(resolveBirdeyeChain('optimism')).toBe('optimism');
    expect(resolveBirdeyeChain('unichain')).toBeNull();
    expect(resolveBirdeyeChain('nope')).toBeNull();
  });

  it('sends the x-chain header per chain (not a solana default)', async () => {
    const service = await keyedService();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: { success: true, data: { address: 'a', price: 1 } },
    });
    await service.getTokenOverview('addr', 'base');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/defi/token_overview'),
      expect.objectContaining({
        headers: { 'X-API-KEY': 'test-key', 'x-chain': 'base' },
      }),
    );
  });

  it('unmapped chain resolves null zero-network', async () => {
    const service = await keyedService();
    const spy = jest.spyOn(axios, 'get');
    await expect(
      service.getTokenOverview('addr', 'unichain'),
    ).resolves.toBeNull();
    await expect(service.getTokenPrice('addr', 'unichain')).resolves.toBeNull();
    await expect(
      service.getTokenSecurity('addr', 'unichain'),
    ).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('no key resolves null zero-network (fail-open preserved)', async () => {
    const service = await keylessService();
    const spy = jest.spyOn(axios, 'get');
    await expect(service.getTokenOverview('addr', 'base')).resolves.toBeNull();
    await expect(service.getTokenSecurity('addr', 'base')).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('getTokenSecurity parses the { success, data } envelope', async () => {
    const service = await keyedService();
    const spy = jest.spyOn(axios, 'get').mockResolvedValue({
      data: {
        success: true,
        data: { address: 'addr', ownershipRenounced: true },
      },
    });
    const security = await service.getTokenSecurity('addr', 'ethereum');
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/defi/token_security'),
      expect.objectContaining({
        headers: { 'X-API-KEY': 'test-key', 'x-chain': 'ethereum' },
      }),
    );
    expect(security?.address).toBe('addr');
  });

  it('fetcher serves EVM chains now (widen proof) with the existing shape', async () => {
    const getTokenOverview = jest.fn(async () => ({
      address: 'a',
      price: 2.5,
      priceChange24h: 1,
      volume24h: 100,
      liquidity: 500,
      mc: 1000,
      totalSupply: 400,
      holder: 50,
      decimals: 18,
      name: 'T',
      symbol: 'TKN',
    }));
    const d = stubDeps({ birdeye: { getTokenOverview } });
    const fetchers = buildProviderQuoteFetchers(d);
    const birdeye = fetchers.find((f) => f.name === 'birdeye')!;
    expect(birdeye.supportsChains).toEqual([
      'solana',
      'ethereum',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
      'robinhood',
    ]);
    const quote = await birdeye.fetch('base', 'addr');
    expect(getTokenOverview).toHaveBeenCalledWith('addr', 'base');
    expect(quote?.priceUsd).toBe(2.5);
    expect(quote?.holders).toBe(50);
  });

  it('registry descriptor matches the fetcher widening (coherent)', () => {
    const descriptor = DEFAULT_PROVIDERS.find((p) => p.name === 'birdeye')!;
    expect([...descriptor.supportsChains]).toEqual([
      'solana',
      'ethereum',
      'bsc',
      'base',
      'arbitrum',
      'polygon',
      'robinhood',
    ]);
  });
});
