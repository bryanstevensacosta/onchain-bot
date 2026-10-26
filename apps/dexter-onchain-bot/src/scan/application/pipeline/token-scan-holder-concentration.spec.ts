import { TokenScanPipeline } from './token-scan.pipeline';
import type { MarketDataSnapshot } from '@/scan/infrastructure/market-data/market-data.client';

/**
 * `holderConcentration` pipeline seam (plan dexter-rick-compact-card
 * §10.6-§10.7): the field MUST be declared in the inline structural
 * type of `toResolvedToken` AND mapped explicitly — a field that is
 * only present on the client snapshot is silently dropped there
 * (regression this spec pins). The pipeline re-validates the object
 * (same double-validation as `honeypot`/`venue`), so malformed JSON
 * that bypasses the client guard still resolves `null`.
 */

const CHALE = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';

const VALID = {
  topPercents: [4.3, 3.3, 2.8, 2.3, 1.8],
  top10Percent: 20,
};

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

describe('TokenScanPipeline holderConcentration passthrough', () => {
  it('keeps holderConcentration on the ResolvedToken (no silent drop)', async () => {
    const token = await resolveWith({ holderConcentration: VALID });
    expect(token?.holderConcentration).toEqual(VALID);
    expect(token).toHaveProperty('holderConcentration');
  });

  it('accepts ties and a single value', async () => {
    const ties = { topPercents: [5, 5, 2], top10Percent: 12 };
    expect(
      (await resolveWith({ holderConcentration: ties }))?.holderConcentration,
    ).toEqual(ties);
    const single = { topPercents: [5], top10Percent: 5 };
    expect(
      (await resolveWith({ holderConcentration: single }))?.holderConcentration,
    ).toEqual(single);
  });

  it('re-validates an incoherent object to null (double validation)', async () => {
    const token = await resolveWith({
      holderConcentration: { topPercents: [5, 5], top10Percent: 9 },
    });
    expect(token?.holderConcentration).toBeNull();
  });

  it('re-validates a non-increasing order to null', async () => {
    const token = await resolveWith({
      holderConcentration: { topPercents: [1, 9], top10Percent: 20 },
    });
    expect(token?.holderConcentration).toBeNull();
  });

  it('sets an explicit null when market-data carries no field', async () => {
    const token = await resolveWith();
    expect(token?.holderConcentration).toBeNull();
    expect(token).toHaveProperty('holderConcentration', null);
  });

  it('keeps the legacy top10HolderPercent untouched (separate metric)', async () => {
    const token = await resolveWith({
      top10HolderPercent: 22.1,
      holderConcentration: VALID,
    });
    expect(token?.top10HolderPercent).toBe(22.1);
    expect(token?.holderConcentration).toEqual(VALID);
  });
});
