import { TokenScanPipeline } from './token-scan.pipeline';
import type { MarketDataSnapshot } from '@/scan/infrastructure/market-data/market-data.client';

const CFB3 = '0xCfb3a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2';
const ATH_AT = '2024-09-24T12:00:00.000Z';

function snapshot(
  overrides: Partial<MarketDataSnapshot> = {},
): MarketDataSnapshot {
  return {
    chain: 'ethereum',
    address: CFB3,
    symbol: 'CFB3',
    name: 'Cfb3',
    priceUsd: 0.0000056,
    priceChange24h: 8.5,
    marketCapUsd: 5100,
    fdvUsd: 5100,
    liquidityUsd: 2500,
    lockedLiquidityPercent: null,
    burnedPercent: null,
    volume24hUsd: 900,
    holders: 320,
    top10HolderPercent: 31.2,
    totalSupply: 1000000000,
    circulatingSupply: 900000000,
    maxSupply: null,
    devWallets: null,
    devPctSupply: null,
    status: 'ready',
    ...overrides,
  };
}

describe('TokenScanPipeline fdvAth passthrough (plan todo 16)', () => {
  it('passes snapshot fdvAthUsd/fdvAthAt through to the token', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () => snapshot({ fdvAthUsd: 5600, fdvAthAt: ATH_AT }),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`ethereum:${CFB3}`);
    expect(token?.fdvAthUsd).toBe(5600);
    expect(token?.fdvAthAt).toBe(ATH_AT);
  });

  it('resolves nulls when the snapshot carries no ATH (cold-start)', async () => {
    const client = {
      detectChain: async () => null,
      getSnapshot: async () => snapshot(),
    };
    const pipeline = new TokenScanPipeline(client as never);
    const token = await pipeline.resolve(`ethereum:${CFB3}`);
    expect(token?.fdvAthUsd).toBeNull();
    expect(token?.fdvAthAt).toBeNull();
  });

  it.each([
    ['NaN value', { fdvAthUsd: Number.NaN, fdvAthAt: ATH_AT }],
    [
      'Infinity value',
      { fdvAthUsd: Number.POSITIVE_INFINITY, fdvAthAt: ATH_AT },
    ],
    ['string value', { fdvAthUsd: '5600', fdvAthAt: ATH_AT }],
    ['unparseable timestamp', { fdvAthUsd: 5600, fdvAthAt: 'not-a-date' }],
    ['empty timestamp', { fdvAthUsd: 5600, fdvAthAt: '' }],
  ])(
    'nulls malformed ATH at the pipeline boundary (%s), never crashes',
    async (_label, ath) => {
      const client = {
        detectChain: async () => null,
        getSnapshot: async () => snapshot({ ...ath }),
      };
      const pipeline = new TokenScanPipeline(client as never);
      const token = await pipeline.resolve(`ethereum:${CFB3}`);
      expect(token).not.toBeNull();
      if (
        typeof ath.fdvAthUsd !== 'number' ||
        !Number.isFinite(ath.fdvAthUsd)
      ) {
        expect(token?.fdvAthUsd).toBeNull();
      }
      if (
        typeof ath.fdvAthAt !== 'string' ||
        Number.isNaN(Date.parse(ath.fdvAthAt))
      ) {
        expect(token?.fdvAthAt).toBeNull();
      }
    },
  );
});
