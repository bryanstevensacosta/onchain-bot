import { TokenScanPipeline } from './token-scan.pipeline';
import type { MarketDataSnapshot } from '@/scan/infrastructure/market-data/market-data.client';

const CHALE_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';

function snapshot(
  overrides: Partial<MarketDataSnapshot> = {},
): MarketDataSnapshot {
  return {
    chain: 'solana',
    address: CHALE_MINT,
    symbol: 'CHALE',
    name: 'Chale',
    priceUsd: 0.00007707,
    priceChange24h: 353,
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

describe('TokenScanPipeline bondingCurve re-validation (launchpad layout)', () => {
  it('passes a valid bondingCurve through to token.bondingCurve', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () =>
        snapshot({
          bondingCurve: {
            onCurve: true,
            launchpadId: 'pump-fun',
            quoteSymbol: 'Bitcoin',
            quoteMint: 'BitcoinMint111111111111111111111111111111',
            progressPercent: 45,
          },
        }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${CHALE_MINT}`);
    expect(token?.bondingCurve).toEqual({
      onCurve: true,
      launchpadId: 'pump-fun',
      quoteSymbol: 'Bitcoin',
      quoteMint: 'BitcoinMint111111111111111111111111111111',
      progressPercent: 45,
    });
  });

  it('re-validates at the pipeline boundary: malformed curve → null', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () =>
        snapshot({
          bondingCurve: {
            onCurve: true,
            launchpadId: '',
            progressPercent: 45,
          } as never,
        }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${CHALE_MINT}`);
    expect(token?.bondingCurve).toBeNull();
  });

  it('resolves bondingCurve null when the snapshot carries none', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () => snapshot(),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${CHALE_MINT}`);
    expect(token?.bondingCurve).toBeNull();
  });

  it('passes the four 5m fields through with explicit null when absent', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () =>
        snapshot({
          volume5mUsd: 159,
          priceChange5m: -1.7,
          txns5mBuys: 3,
          txns5mSells: 5,
        }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${CHALE_MINT}`);
    expect(token?.volume5mUsd).toBe(159);
    expect(token?.priceChange5m).toBe(-1.7);
    expect(token?.txns5mBuys).toBe(3);
    expect(token?.txns5mSells).toBe(5);

    const bare = new TokenScanPipeline({
      detectChain: async () => null,
      getSnapshot: async () => snapshot(),
    } as never);
    const empty = await bare.resolve(`solana:${CHALE_MINT}`);
    expect(empty?.volume5mUsd).toBeNull();
    expect(empty?.priceChange5m).toBeNull();
    expect(empty?.txns5mBuys).toBeNull();
    expect(empty?.txns5mSells).toBeNull();
  });
});
