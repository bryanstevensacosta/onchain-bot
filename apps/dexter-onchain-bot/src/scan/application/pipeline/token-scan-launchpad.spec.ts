import { TokenScanPipeline } from './token-scan.pipeline';
import type { MarketDataSnapshot } from '@/scan/infrastructure/market-data/market-data.client';

const CHALE_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';
const JUP_MINT = 'JUPyiwrYJFskUPiHa7hVuNQPiyaPZ3ar1ZkL6vwdB';
const HUMA_ADDRESS = '0x925061143Df8D59f5EB980A8cA33d649f0a4B4aC7';

function snapshot(
  overrides: Partial<MarketDataSnapshot> = {},
): MarketDataSnapshot {
  return {
    chain: 'solana',
    address: CHALE_MINT,
    symbol: 'CHALE',
    name: 'Chale',
    priceUsd: 0.000069,
    priceChange24h: 12.5,
    marketCapUsd: 69000,
    fdvUsd: 69000,
    liquidityUsd: 30000,
    lockedLiquidityPercent: null,
    burnedPercent: null,
    volume24hUsd: 150000,
    holders: 1200,
    top10HolderPercent: 25.0,
    totalSupply: 1000000000,
    circulatingSupply: 1000000000,
    maxSupply: null,
    devWallets: null,
    devPctSupply: null,
    status: 'ready',
    ...overrides,
  };
}

describe('TokenScanPipeline launchpad passthrough (dexter-launchpad Lane S)', () => {
  it('passes snapshot.launchpad through to token.launchpad (CHALE-shaped)', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () =>
        snapshot({
          launchpad: {
            id: 'pump-fun',
            name: 'Pump.fun',
            url: `https://pump.fun/coin/${CHALE_MINT}`,
          },
        }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${CHALE_MINT}`);
    expect(token?.launchpad).toEqual({
      id: 'pump-fun',
      name: 'Pump.fun',
      url: `https://pump.fun/coin/${CHALE_MINT}`,
    });
  });

  it.each([
    ['JUP official (team launch)', `solana:${JUP_MINT}`],
    ['HUMA official (team launch)', `bsc:${HUMA_ADDRESS}`],
  ])('resolves %s with launchpad null', async (_label, input) => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () => snapshot({ launchpad: null }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(input);
    expect(token?.launchpad).toBeNull();
  });

  it('nulls a malformed snapshot launchpad at the pipeline boundary, never crashes', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () =>
        snapshot({
          launchpad: { id: 'pump-fun', name: 'Pump.fun' } as never,
        }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${CHALE_MINT}`);
    expect(token?.launchpad).toBeNull();
  });
});
