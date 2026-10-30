import { MarketDataClient, toBondingCurveOrNull } from './market-data.client';

const PAIR = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';

const BASE_SNAPSHOT = {
  chain: 'solana',
  address: PAIR,
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
  top20HolderPercent: null,
  totalSupply: 1_000_000_000_000,
  circulatingSupply: 1_000_000_000_000,
  maxSupply: null,
  devWallets: null,
  devPctSupply: null,
  status: 'ready',
};

const CURVE = {
  onCurve: true,
  launchpadId: 'pump-fun',
  quoteSymbol: 'Bitcoin',
  quoteMint: 'BitcoinMint111111111111111111111111111111',
  progressPercent: 45,
};

describe('MarketDataClient bondingCurve + 5m guards (launchpad layout)', () => {
  const OLD_FETCH = global.fetch;

  afterEach(() => {
    global.fetch = OLD_FETCH;
    jest.restoreAllMocks();
  });

  it('maps the on-curve object verbatim', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify({ ...BASE_SNAPSHOT, bondingCurve: CURVE }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const snapshot = await new MarketDataClient().getSnapshot('solana', PAIR);
    expect(snapshot?.bondingCurve).toEqual(CURVE);
  });

  it('normalizes absent quote members and progress to null', async () => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          ...BASE_SNAPSHOT,
          bondingCurve: { onCurve: true, launchpadId: 'pump-fun' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    expect(
      (await new MarketDataClient().getSnapshot('solana', PAIR))?.bondingCurve,
    ).toEqual({
      onCurve: true,
      launchpadId: 'pump-fun',
      quoteSymbol: null,
      quoteMint: null,
      progressPercent: null,
    });
  });

  it('resolves null when the snapshot carries no bondingCurve', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(BASE_SNAPSHOT), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    expect(
      (await new MarketDataClient().getSnapshot('solana', PAIR))?.bondingCurve,
    ).toBeNull();
  });

  it.each([
    ['onCurve false', { ...CURVE, onCurve: false }],
    ['onCurve missing', { launchpadId: 'pump-fun' }],
    ['onCurve truthy string', { ...CURVE, onCurve: 'true' }],
    ['empty launchpadId', { ...CURVE, launchpadId: '' }],
    ['numeric launchpadId', { ...CURVE, launchpadId: 7 }],
    ['empty quoteSymbol', { ...CURVE, quoteSymbol: '' }],
    ['numeric quoteMint', { ...CURVE, quoteMint: 7 }],
    ['progress 101', { ...CURVE, progressPercent: 101 }],
    ['negative progress', { ...CURVE, progressPercent: -0.1 }],
    ['NaN progress', { ...CURVE, progressPercent: Number.NaN }],
    ['string progress', { ...CURVE, progressPercent: '45' }],
  ])('rejects the whole object on a contract violation (%s)', (_label, raw) => {
    expect(toBondingCurveOrNull(raw)).toBeNull();
  });

  it('accepts the 0 and 100 progress bounds and rejects non-objects', () => {
    expect(toBondingCurveOrNull({ ...CURVE, progressPercent: 0 })).toEqual({
      ...CURVE,
      progressPercent: 0,
    });
    expect(toBondingCurveOrNull({ ...CURVE, progressPercent: 100 })).toEqual({
      ...CURVE,
      progressPercent: 100,
    });
    expect(toBondingCurveOrNull(null)).toBeNull();
    expect(toBondingCurveOrNull(undefined)).toBeNull();
    expect(toBondingCurveOrNull('curve')).toBeNull();
    expect(toBondingCurveOrNull([CURVE])).toBeNull();
  });

  it('validates the four 5m wire fields like the 1h ones', async () => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          ...BASE_SNAPSHOT,
          volume5mUsd: 159,
          priceChange5m: -1.7,
          txns5mBuys: 3,
          txns5mSells: 5,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const snapshot = await new MarketDataClient().getSnapshot('solana', PAIR);
    expect(snapshot?.volume5mUsd).toBe(159);
    expect(snapshot?.priceChange5m).toBe(-1.7);
    expect(snapshot?.txns5mBuys).toBe(3);
    expect(snapshot?.txns5mSells).toBe(5);
  });

  it('nulls invalid / absent 5m values (row silenced by the renderer)', async () => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          ...BASE_SNAPSHOT,
          volume5mUsd: Number.NaN,
          priceChange5m: '1.7',
          txns5mBuys: -1,
          txns5mSells: Number.POSITIVE_INFINITY,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const snapshot = await new MarketDataClient().getSnapshot('solana', PAIR);
    expect(snapshot?.volume5mUsd).toBeNull();
    expect(snapshot?.priceChange5m).toBeNull();
    expect(snapshot?.txns5mBuys).toBeNull();
    expect(snapshot?.txns5mSells).toBeNull();
  });
});
