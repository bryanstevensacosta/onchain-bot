import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import axios from 'axios';
import { DexScreenerService } from './dexscreener.service';
import {
  DEXSCREENER_CONFIG,
  type DexScreenerConfig,
} from './dexscreener.config';
import type { DexScreenerPair } from './dexscreener.types';
import { buildProviderQuoteFetchers } from '../quote-fetchers/provider-quote.fetchers';

/**
 * Robinhood coverage (dexter plan todo 24): the DexScreener
 * `robinhood` slug carries the `0x968B…5583` (NYMA) pair live
 * (verified 2026-10-06: HTTP 200, `uniswap` v4, liq ~$6K) — the
 * fixture below is that live row, byte-faithful where asserted.
 */
const NYMA = '0x968Be0c1A394Bf1cE239E3b40909eC0F9d4f5583';

const NYMA_PAIR: DexScreenerPair = {
  chainId: 'robinhood',
  dexId: 'uniswap',
  url: 'https://dexscreener.com/robinhood/0x20be4118815ff481c1f5c16ce67a850dcdf0913978e13787c11d26594f98258f',
  pairAddress:
    '0x20be4118815ff481c1f5c16ce67a850dcdf0913978e13787c11d26594f98258f',
  labels: ['v4'],
  baseToken: { address: NYMA, name: 'Anonyma', symbol: 'NYMA' },
  quoteToken: {
    address: '0x0000000000000000000000000000000000000000',
    name: 'Ether',
    symbol: 'ETH',
  },
  priceNative: '0.000000001458',
  priceUsd: '0.000003959',
  txns: {
    m5: { buys: 0, sells: 0 },
    h1: { buys: 0, sells: 0 },
    h6: { buys: 0, sells: 0 },
    h24: { buys: 0, sells: 6 },
  },
  volume: { h24: 125.82, h6: 0, h1: 0, m5: 0 },
  priceChange: { h24: -7.88 },
  liquidity: { usd: 6070.2, base: 766603090, quote: 1.1181 },
  fdv: 3811,
  marketCap: 3811,
  pairCreatedAt: 1790322624000,
};

async function realService(): Promise<DexScreenerService> {
  const module = await Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true })],
    providers: [
      DexScreenerService,
      { provide: DEXSCREENER_CONFIG, useValue: {} as DexScreenerConfig },
    ],
  }).compile();
  return module.get(DexScreenerService);
}

describe('DexScreener robinhood coverage (todo 24, 0x968B fixture)', () => {
  afterEach(() => jest.restoreAllMocks());

  it('resolves the NYMA pair via the robinhood slug (strict per-chain)', async () => {
    const service = await realService();
    const spy = jest
      .spyOn(axios, 'get')
      .mockResolvedValue({ data: [NYMA_PAIR] });
    const summary = await service.getBestPairSummaryForChain('robinhood', NYMA);
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('/token-pairs/v1/robinhood/'),
      expect.anything(),
    );
    expect(summary?.dexId).toBe('uniswap');
    expect(summary?.labels).toEqual(['v4']);
    expect(summary?.liquidityUsd).toBe(6070.2);
    expect(summary?.baseToken.symbol).toBe('NYMA');
    expect(summary?.baseToken.address).toBe(NYMA);
  });

  it('attributes identity from the matching (base) side in the quote fetcher', async () => {
    const fetchers = buildProviderQuoteFetchers({
      dexscreener: {
        getBestPairSummaryForChain: async () =>
          ({
            priceUsd: '0.000003959',
            marketCap: 3811,
            fdv: 3811,
            liquidityUsd: 6070.2,
            volume24h: 125.82,
            priceChange24h: -7.88,
            baseToken: { address: NYMA, symbol: 'NYMA', name: 'Anonyma' },
            quoteToken: {
              address: '0x0000000000000000000000000000000000000000',
              symbol: 'ETH',
              name: 'Ether',
            },
          }) as never,
      },
      geckoterminal: { getTokenInfo: async () => null },
      birdeye: { getTokenOverview: async () => null },
      ccxt: { defaultExchange: 'binance', fetchTicker: async () => null },
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
    } as unknown as Parameters<typeof buildProviderQuoteFetchers>[0]);
    const dex = fetchers.find((fetcher) => fetcher.name === 'dexscreener');
    expect(dex?.supportsChains).toContain('robinhood');
    const quote = await dex?.fetch('robinhood', NYMA);
    expect(quote?.symbol).toBe('NYMA');
    expect(quote?.liquidityUsd).toBe(6070.2);
  });

  it('still resolves null with zero network for slugs without a row (optimism — unichain mapped since todo 31)', async () => {
    const service = await realService();
    const spy = jest.spyOn(axios, 'get');
    await expect(
      service.getBestPairSummaryForChain('optimism', NYMA),
    ).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});
