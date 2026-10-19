import { TokenScanPipeline } from './token-scan.pipeline';
import type { MarketDataSnapshot } from '@/scan/infrastructure/market-data/market-data.client';

const CHALE_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';
const PAIR = '0x925061143Df8D59f5EB980A8cA33d649f0a4B4aC7';

function snapshot(
  overrides: Partial<MarketDataSnapshot> = {},
): MarketDataSnapshot {
  return {
    chain: 'bsc',
    address: PAIR,
    symbol: 'SAFEMOONCASH',
    name: 'SafeMoonCash',
    priceUsd: 0.00000001,
    priceChange24h: 12.5,
    marketCapUsd: 4_000_000,
    fdvUsd: 4_100_000,
    liquidityUsd: 900_000,
    lockedLiquidityPercent: null,
    burnedPercent: null,
    volume24hUsd: 150_000,
    holders: 1200,
    top10HolderPercent: 25.0,
    totalSupply: 1_000_000_000_000,
    circulatingSupply: 1_000_000_000_000,
    maxSupply: null,
    devWallets: null,
    devPctSupply: null,
    status: 'ready',
    ...overrides,
  };
}

describe('TokenScanPipeline honeypot re-validation (plan todo 71)', () => {
  it('passes a valid snapshot.honeypot through to token.honeypot', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () =>
        snapshot({ honeypot: { buy: 3.99, sell: 3.8, sim: 'ok' } }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`bsc:${PAIR}`);
    expect(token?.honeypot).toEqual({ buy: 3.99, sell: 3.8, sim: 'ok' });
  });

  it('re-validates at the pipeline boundary: malformed honeypot → null', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () =>
        snapshot({ honeypot: { buy: -1, sell: 2, sim: 'ok' } as never }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`bsc:${PAIR}`);
    expect(token?.honeypot).toBeNull();
  });

  it('resolves honeypot null when the snapshot carries none', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () =>
        snapshot({ address: CHALE_MINT, chain: 'solana' }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${CHALE_MINT}`);
    expect(token?.honeypot).toBeNull();
  });

  it('keeps honeypot independent from launchpad/venue', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () =>
        snapshot({
          honeypot: { buy: null, sell: null, sim: 'fail' },
          launchpad: { id: 'flap', name: 'Flap', url: 'https://x' },
          venue: { dexId: 'pancakeswap', labels: ['v2'] },
        }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`bsc:${PAIR}`);
    expect(token?.honeypot).toEqual({ buy: null, sell: null, sim: 'fail' });
    expect(token?.launchpad?.id).toBe('flap');
    expect(token?.venue).toEqual({ dexId: 'pancakeswap', labels: ['v2'] });
  });
});
