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
    status: 'ready',
    ...overrides,
  };
}

/**
 * Failing-first: supply fields ride the dexter lookup path end-to-end
 * (client snapshot -> pipeline token -> Telegram card), null-safe when
 * the provider carries no supplies.
 */
describe('TokenScanPipeline + formatter (supply fields)', () => {
  it('passes total/circulating/max supply through to the resolved token', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () => snapshot(),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${SOL}`);
    expect(token?.totalSupply).toBe(1000000);
    expect(token?.circulatingSupply).toBe(800000);
    expect(token?.maxSupply).toBe(1000000);
  });

  it('adversarial: provider without supplies resolves with nulls, no crash', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () =>
        snapshot({
          totalSupply: null,
          circulatingSupply: null,
          maxSupply: null,
        }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${SOL}`);
    expect(token).not.toBeNull();
    expect(token?.totalSupply).toBeNull();
    expect(token?.circulatingSupply).toBeNull();
    expect(token?.maxSupply).toBeNull();
    const text = new MessageFormatterAdapter().format(token!);
    expect(text).toContain('Total supply');
    expect(text).toContain('N/A');
  });

  it('full card renders FDV + supply lines with real values', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () => snapshot(),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`solana:${SOL}`);
    const text = new MessageFormatterAdapter().format(token!);
    expect(text).toContain('FDV');
    expect(text).toContain('Total supply');
    expect(text).toContain('Circulating');
    expect(text).toContain('Max supply');
  });
});
