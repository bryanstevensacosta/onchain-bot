import {
  MarketDataClient,
  toHolderConcentrationOrNull,
} from './market-data.client';

/**
 * `toHolderConcentrationOrNull` (plan dexter-rick-compact-card
 * §10.5-§10.7): boundary shape-guard for the frozen wire contract
 * `holderConcentration: { topPercents: number[]; top10Percent: number }
 * | null` produced by market-data.
 *
 * Pattern: `toVenueOrNull` / `toHoneypotOrNull` — reject non-objects
 * (arrays included: the reading is a RECORD), non-array
 * `topPercents`, more than 5 entries, non-finite or out-of-[0,100]
 * entries, a non non-increasing order (`p[i] >= p[i+1]`; TIES are
 * valid), a non-finite `top10Percent` outside `[-ε, 100+ε]`, and a
 * `sum(topPercents) > top10Percent + ε`. ANY violation resolves the
 * whole object to `null` (silence downstream), never a partial row.
 *
 * `topPercents: []` is a VALID object (the contract may carry it —
 * the renderer silences the row), not malformed.
 */

const CHALE_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';

const VALID = {
  topPercents: [4.3, 3.3, 2.8, 2.3, 1.8],
  top10Percent: 20,
};

const BASE_SNAPSHOT = {
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
};

describe('toHolderConcentrationOrNull (dexter client boundary)', () => {
  it('passes a valid 5-value payload verbatim', () => {
    expect(toHolderConcentrationOrNull(VALID)).toEqual({
      topPercents: [4.3, 3.3, 2.8, 2.3, 1.8],
      top10Percent: 20,
    });
  });

  it('accepts a 1-value payload and accepts TIES (non-increasing)', () => {
    expect(
      toHolderConcentrationOrNull({ topPercents: [5], top10Percent: 5 }),
    ).toEqual({ topPercents: [5], top10Percent: 5 });
    expect(
      toHolderConcentrationOrNull({
        topPercents: [5, 5, 2],
        top10Percent: 12,
      }),
    ).toEqual({ topPercents: [5, 5, 2], top10Percent: 12 });
  });

  it('accepts an EMPTY topPercents array (valid object, silent row)', () => {
    expect(
      toHolderConcentrationOrNull({ topPercents: [], top10Percent: 0 }),
    ).toEqual({ topPercents: [], top10Percent: 0 });
  });

  it('accepts top10Percent inside the epsilon margins ([−ε, 100+ε])', () => {
    expect(
      toHolderConcentrationOrNull({ topPercents: [], top10Percent: -1e-10 }),
    ).toEqual({ topPercents: [], top10Percent: -1e-10 });
    expect(
      toHolderConcentrationOrNull({
        topPercents: [],
        top10Percent: 100 + 1e-10,
      }),
    ).toEqual({ topPercents: [], top10Percent: 100 + 1e-10 });
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['string scalar', 'holder'],
    ['number scalar', 7],
    ['array (the reading is a record)', [4.3, 3.3]],
    ['missing topPercents', { top10Percent: 20 }],
    ['missing top10Percent', { topPercents: [4.3] }],
    ['non-array topPercents', { topPercents: '4.3', top10Percent: 20 }],
    [
      'more than 5 values',
      { topPercents: [9, 8, 7, 6, 5, 4], top10Percent: 50 },
    ],
    ['NaN entry', { topPercents: [4.3, Number.NaN], top10Percent: 20 }],
    [
      'Infinity entry',
      { topPercents: [4.3, Number.POSITIVE_INFINITY], top10Percent: 20 },
    ],
    ['negative entry', { topPercents: [4.3, -0.5], top10Percent: 20 }],
    ['entry above 100', { topPercents: [100.5], top10Percent: 100 }],
    ['string entry', { topPercents: ['4.3'], top10Percent: 20 }],
    [
      'non-increasing order violated',
      { topPercents: [1, 9], top10Percent: 20 },
    ],
    ['NaN top10Percent', { topPercents: [4.3], top10Percent: Number.NaN }],
    [
      'Infinity top10Percent',
      { topPercents: [4.3], top10Percent: Number.POSITIVE_INFINITY },
    ],
    [
      'top10Percent above 100 + ε',
      { topPercents: [4.3], top10Percent: 100.000001 },
    ],
    ['top10Percent below −ε', { topPercents: [], top10Percent: -0.000001 }],
    ['sum above top10 + ε', { topPercents: [5, 5], top10Percent: 9 }],
  ])('resolves null for %s, never passes opaque JSON', (_label, raw) => {
    expect(toHolderConcentrationOrNull(raw)).toBeNull();
  });
});

describe('MarketDataClient.getSnapshot holderConcentration mapping', () => {
  const OLD_FETCH = global.fetch;

  afterEach(() => {
    global.fetch = OLD_FETCH;
    jest.restoreAllMocks();
  });

  const respondWith = (body: Record<string, unknown>): void => {
    global.fetch = async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
  };

  it('maps a valid holderConcentration verbatim', async () => {
    respondWith({ ...BASE_SNAPSHOT, holderConcentration: VALID });
    const client = new MarketDataClient();
    const snapshot = await client.getSnapshot('solana', CHALE_MINT);
    expect(snapshot?.holderConcentration).toEqual({
      topPercents: [4.3, 3.3, 2.8, 2.3, 1.8],
      top10Percent: 20,
    });
  });

  it('resolves null when the field is absent (older answers / non-Solana)', async () => {
    respondWith(BASE_SNAPSHOT);
    const client = new MarketDataClient();
    const snapshot = await client.getSnapshot('solana', CHALE_MINT);
    expect(snapshot?.holderConcentration).toBeNull();
  });

  it.each([
    [
      'more than 5 values',
      { topPercents: [9, 8, 7, 6, 5, 4], top10Percent: 50 },
    ],
    [
      'non-increasing order violated',
      { topPercents: [1, 9], top10Percent: 20 },
    ],
    ['sum above top10', { topPercents: [5, 5], top10Percent: 9 }],
    ['string scalar', 'holders'],
  ])(
    'resolves null for malformed holderConcentration (%s)',
    async (_label, holderConcentration) => {
      respondWith({ ...BASE_SNAPSHOT, holderConcentration });
      const client = new MarketDataClient();
      const snapshot = await client.getSnapshot('solana', CHALE_MINT);
      expect(snapshot?.holderConcentration).toBeNull();
    },
  );
});
