import { TokenScanPipeline } from './token-scan.pipeline';
import { MessageFormatterAdapter } from '@/scan/infrastructure/formatter/message-formatter';
import type { MarketDataSnapshot } from '@/scan/infrastructure/market-data/market-data.client';

const SOL = 'So11111111111111111111111111111111111111112';

function snapshot(
  overrides: Partial<MarketDataSnapshot> = {},
): MarketDataSnapshot {
  return {
    chain: 'solana',
    address: SOL,
    symbol: 'TKN',
    name: 'Token',
    priceUsd: 1.5,
    priceChange24h: 2,
    marketCapUsd: 100,
    fdvUsd: 200,
    liquidityUsd: 50,
    lockedLiquidityPercent: null,
    burnedPercent: null,
    volume24hUsd: 10,
    holders: 42,
    top10HolderPercent: 5,
    totalSupply: 1000000,
    circulatingSupply: 800000,
    maxSupply: 1000000,
    devWallets: null,
    devPctSupply: null,
    status: 'ready',
    ...overrides,
  };
}

describe('TokenScanPipeline + formatter (dev holdings)', () => {
  it('passes devWallets + devPctSupply through to the resolved token', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () =>
        snapshot({
          devWallets: [
            {
              wallet: 'Dev111',
              holdAmount: 1000,
              percentOfSupply: 8.5,
              pnlUsd: 10,
              tag: 'dev',
            },
          ],
          devPctSupply: 8.5,
        }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${SOL}`);
    expect(token?.devPctSupply).toBe(8.5);
    expect(token?.devWallets?.[0]?.wallet).toBe('Dev111');
  });

  it('card renders dev section with values', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () =>
        snapshot({
          devWallets: [
            {
              wallet: 'Dev111AAAAABBBBCCCC',
              holdAmount: 1000,
              percentOfSupply: 8.5,
              pnlUsd: 10,
              tag: 'dev',
            },
          ],
          devPctSupply: 8.5,
        }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${SOL}`);
    const text = new MessageFormatterAdapter().format(token!);
    expect(text).toContain('Dev:');
    expect(text).toContain('8.50%');
  });

  it('adversarial: no dev data renders explicit nulls, never crash', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () => snapshot(),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${SOL}`);
    expect(token?.devWallets).toBeNull();
    expect(token?.devPctSupply).toBeNull();
    const text = new MessageFormatterAdapter().format(token!);
    expect(text).toContain('Dev: N/A');
  });
});
