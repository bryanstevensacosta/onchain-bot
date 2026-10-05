import { TokenScanPipeline } from './token-scan.pipeline';
import type { MarketDataSnapshot } from '@/scan/infrastructure/market-data/market-data.client';

const CHALE_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';
const JUP_MINT = 'JUPyiwrYJFskUPiHa7hVuNQPiyaPZ3ar1ZkL6vwdB';

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

describe('TokenScanPipeline venue passthrough (plan todo 14)', () => {
  it('passes snapshot.venue through to token.venue', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () =>
        snapshot({ venue: { dexId: 'raydium', labels: ['CLMM'] } }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${CHALE_MINT}`);
    expect(token?.venue).toEqual({ dexId: 'raydium', labels: ['CLMM'] });
  });

  it('resolves venue null when the snapshot carries none (JUP team launch)', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () => snapshot({ address: JUP_MINT, venue: null }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${JUP_MINT}`);
    expect(token?.venue).toBeNull();
  });

  it('nulls a malformed snapshot venue at the pipeline boundary, never crashes', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () => snapshot({ venue: { dexId: '', labels: [] } }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${CHALE_MINT}`);
    expect(token?.venue).toBeNull();
  });

  it('passes launchpad and venue independently (no dexId-as-launchpad)', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () =>
        snapshot({
          launchpad: {
            id: 'meteora-dbc',
            name: 'Meteora DBC',
            url: 'https://meteora.ag',
          },
          venue: { dexId: 'meteoradbc', labels: [] },
        }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${CHALE_MINT}`);
    expect(token?.launchpad?.id).toBe('meteora-dbc');
    expect(token?.venue).toEqual({ dexId: 'meteoradbc', labels: [] });
  });
});
