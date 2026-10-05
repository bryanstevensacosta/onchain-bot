import { MarketDataClient, toVenueOrNull } from './market-data.client';

const CHALE_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';

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

describe('toVenueOrNull (dexter client boundary)', () => {
  it('passes a valid venue verbatim', () => {
    expect(toVenueOrNull({ dexId: 'raydium', labels: ['CLMM'] })).toEqual({
      dexId: 'raydium',
      labels: ['CLMM'],
    });
  });

  it.each([
    ['missing dexId', { labels: [] }],
    ['empty dexId', { dexId: '', labels: [] }],
    ['missing labels', { dexId: 'raydium' }],
    ['non-array labels', { dexId: 'raydium', labels: 'CLMM' }],
    ['null', null],
    ['string scalar', 'raydium'],
  ])('resolves null for %s, never passes opaque JSON', (_label, raw) => {
    expect(toVenueOrNull(raw)).toBeNull();
  });

  it('drops non-string labels, keeps the venue', () => {
    expect(toVenueOrNull({ dexId: 'orca', labels: ['wp', 7] })).toEqual({
      dexId: 'orca',
      labels: ['wp'],
    });
  });
});

describe('MarketDataClient.getSnapshot venue mapping (plan todo 14)', () => {
  const OLD_FETCH = global.fetch;

  afterEach(() => {
    global.fetch = OLD_FETCH;
    jest.restoreAllMocks();
  });

  it('maps a valid snapshot venue verbatim', async () => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          ...BASE_SNAPSHOT,
          venue: { dexId: 'meteoradbc', labels: [] },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const client = new MarketDataClient();
    const snapshot = await client.getSnapshot('solana', CHALE_MINT);
    expect(snapshot?.venue).toEqual({ dexId: 'meteoradbc', labels: [] });
  });

  it('resolves null when the snapshot carries no venue', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(BASE_SNAPSHOT), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const client = new MarketDataClient();
    const snapshot = await client.getSnapshot('solana', CHALE_MINT);
    expect(snapshot?.venue).toBeNull();
  });

  it.each([
    ['empty dexId', { dexId: '', labels: [] }],
    ['missing labels', { dexId: 'raydium' }],
    ['string scalar', 'raydium'],
  ])(
    'resolves null for malformed venue (%s), never passes opaque JSON',
    async (_label, venue) => {
      global.fetch = async () =>
        new Response(JSON.stringify({ ...BASE_SNAPSHOT, venue }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      const client = new MarketDataClient();
      const snapshot = await client.getSnapshot('solana', CHALE_MINT);
      expect(snapshot?.venue).toBeNull();
    },
  );
});
