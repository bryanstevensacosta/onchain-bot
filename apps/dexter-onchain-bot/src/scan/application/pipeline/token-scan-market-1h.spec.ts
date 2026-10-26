import { TokenScanPipeline } from './token-scan.pipeline';
import type { MarketDataSnapshot } from '@/scan/infrastructure/market-data/market-data.client';

const CHALE = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';

function snapshot(
  overrides: Partial<MarketDataSnapshot> = {},
): MarketDataSnapshot {
  return {
    chain: 'solana',
    address: CHALE,
    symbol: 'CHALE',
    name: 'Chale',
    priceUsd: 0.0000762,
    priceChange24h: 4.2,
    marketCapUsd: 76200,
    fdvUsd: 76200,
    liquidityUsd: 31000,
    lockedLiquidityPercent: null,
    burnedPercent: null,
    volume24hUsd: 120000,
    holders: 900,
    top10HolderPercent: 22.1,
    totalSupply: 1000000000,
    circulatingSupply: 1000000000,
    maxSupply: null,
    devWallets: null,
    devPctSupply: null,
    status: 'ready',
    ...overrides,
  };
}

const resolveWith = async (overrides: Partial<MarketDataSnapshot> = {}) => {
  const client = {
    detectChain: async () => null,
    getSnapshot: async () => snapshot(overrides),
  };
  return new TokenScanPipeline(client as never).resolve(`solana:${CHALE}`);
};

describe('TokenScanPipeline 1-hour passthrough (dexter `{{market1hRow}}`)', () => {
  it('passes the four 1h values through to the ResolvedToken', async () => {
    const token = await resolveWith({
      volume1hUsd: 159,
      priceChange1h: 1.7,
      txns1hBuys: 3,
      txns1hSells: 5,
    });
    expect(token?.volume1hUsd).toBe(159);
    expect(token?.priceChange1h).toBe(1.7);
    expect(token?.txns1hBuys).toBe(3);
    expect(token?.txns1hSells).toBe(5);
  });

  it('keeps a negative 1h change intact (direction survives)', async () => {
    const token = await resolveWith({ priceChange1h: -12.5 });
    expect(token?.priceChange1h).toBe(-12.5);
  });

  it('sets explicit nulls when market-data carries no 1h fields', async () => {
    const token = await resolveWith();
    expect(token?.volume1hUsd).toBeNull();
    expect(token?.priceChange1h).toBeNull();
    expect(token?.txns1hBuys).toBeNull();
    expect(token?.txns1hSells).toBeNull();
    // Explicit null, never `undefined` — the renderer silences either
    // way, but the pipeline contract stays predictable.
    expect(token).toHaveProperty('volume1hUsd', null);
    expect(token).toHaveProperty('txns1hSells', null);
  });

  it('keeps the 24h fields untouched (no aliasing between windows)', async () => {
    const token = await resolveWith({
      volume24hUsd: 120000,
      priceChange24h: 4.2,
      volume1hUsd: 159,
      priceChange1h: 1.7,
    });
    expect(token?.volume24hUsd).toBe(120000);
    expect(token?.priceChange24h).toBe(4.2);
    expect(token?.volume1hUsd).toBe(159);
    expect(token?.priceChange1h).toBe(1.7);
  });
});
