import {
  MarketDataClient,
  toFiniteNumberOrNull,
  toNonNegativeCountOrNull,
} from './market-data.client';

const CHALE = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';

const BASE_SNAPSHOT = {
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
};

describe('1-hour boundary guards (dexter `{{market1hRow}}`)', () => {
  it('passes finite numbers verbatim', () => {
    expect(toFiniteNumberOrNull(159)).toBe(159);
    expect(toFiniteNumberOrNull(0)).toBe(0);
    expect(toFiniteNumberOrNull(-3.4)).toBe(-3.4);
  });

  it.each([
    [null],
    [undefined],
    ['159'],
    [Number.NaN],
    [Infinity],
    [true],
    [{}],
  ])('toFiniteNumberOrNull resolves null for %s', (raw) => {
    expect(toFiniteNumberOrNull(raw)).toBeNull();
  });

  it('accepts finite non-negative counts (including zero)', () => {
    expect(toNonNegativeCountOrNull(0)).toBe(0);
    expect(toNonNegativeCountOrNull(3)).toBe(3);
  });

  it.each([
    [null],
    [undefined],
    ['3'],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    [-1],
    [-0.5],
  ])('toNonNegativeCountOrNull resolves null for %s', (raw) => {
    expect(toNonNegativeCountOrNull(raw)).toBeNull();
  });
});

describe('MarketDataClient.getSnapshot 1-hour mapping', () => {
  const OLD_FETCH = global.fetch;

  afterEach(() => {
    global.fetch = OLD_FETCH;
    jest.restoreAllMocks();
  });

  const respondWith = (body: unknown): void => {
    global.fetch = async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
  };

  it('maps the four 1h fields when present', async () => {
    respondWith({
      ...BASE_SNAPSHOT,
      volume1hUsd: 159,
      priceChange1h: 1.7,
      txns1hBuys: 3,
      txns1hSells: 5,
    });
    const snapshot = await new MarketDataClient().getSnapshot('solana', CHALE);
    expect(snapshot?.volume1hUsd).toBe(159);
    expect(snapshot?.priceChange1h).toBe(1.7);
    expect(snapshot?.txns1hBuys).toBe(3);
    expect(snapshot?.txns1hSells).toBe(5);
  });

  it('maps a negative 1h change (direction is preserved)', async () => {
    respondWith({ ...BASE_SNAPSHOT, priceChange1h: -12.5 });
    const snapshot = await new MarketDataClient().getSnapshot('solana', CHALE);
    expect(snapshot?.priceChange1h).toBe(-12.5);
  });

  it('resolves all four to null when absent (older market-data answer)', async () => {
    respondWith(BASE_SNAPSHOT);
    const snapshot = await new MarketDataClient().getSnapshot('solana', CHALE);
    expect(snapshot?.volume1hUsd).toBeNull();
    expect(snapshot?.priceChange1h).toBeNull();
    expect(snapshot?.txns1hBuys).toBeNull();
    expect(snapshot?.txns1hSells).toBeNull();
  });

  it.each([
    ['string volume', { volume1hUsd: '159' }],
    ['object change', { priceChange1h: { usd: 1.7 } }],
    ['negative buys', { txns1hBuys: -1 }],
    ['boolean sells', { txns1hSells: true }],
    ['null-ish strings', { volume1hUsd: 'NaN', txns1hBuys: 'three' }],
  ])('resolves garbage to null (%s)', async (_label, extra) => {
    respondWith({ ...BASE_SNAPSHOT, ...extra });
    const snapshot = await new MarketDataClient().getSnapshot('solana', CHALE);
    expect(snapshot?.volume1hUsd ?? null).toBeNull();
    expect(snapshot?.priceChange1h ?? null).toBeNull();
    expect(snapshot?.txns1hBuys ?? null).toBeNull();
    expect(snapshot?.txns1hSells ?? null).toBeNull();
  });
});
