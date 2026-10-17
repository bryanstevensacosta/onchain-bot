import { MarketDataClient, toPairCreatedAtOrNull } from './market-data.client';

const WENCAT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';
const PAIR_AT = '2026-10-13T12:01:14.000Z';

const BASE_SNAPSHOT = {
  chain: 'solana',
  address: WENCAT,
  symbol: 'WENCAT',
  name: 'Wencat',
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

describe('toPairCreatedAtOrNull (dexter client boundary)', () => {
  it('passes an ISO pair timestamp verbatim', () => {
    expect(toPairCreatedAtOrNull(PAIR_AT)).toBe(PAIR_AT);
  });

  it.each([[null], [undefined], [''], ['not-a-date'], [1791892874000], [true]])(
    'resolves null for %s, never passes opaque JSON',
    (raw) => {
      expect(toPairCreatedAtOrNull(raw)).toBeNull();
    },
  );
});

describe('MarketDataClient.getSnapshot pairCreatedAt mapping (plan todo 63)', () => {
  const OLD_FETCH = global.fetch;

  afterEach(() => {
    global.fetch = OLD_FETCH;
    jest.restoreAllMocks();
  });

  it('maps a valid top-level pairCreatedAt verbatim', async () => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({ ...BASE_SNAPSHOT, pairCreatedAt: PAIR_AT }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const client = new MarketDataClient();
    const snapshot = await client.getSnapshot('solana', WENCAT);
    expect(snapshot?.pairCreatedAt).toBe(PAIR_AT);
  });

  it('resolves null when the snapshot carries no pairCreatedAt (older answer)', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(BASE_SNAPSHOT), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const client = new MarketDataClient();
    const snapshot = await client.getSnapshot('solana', WENCAT);
    expect(snapshot?.pairCreatedAt).toBeNull();
  });

  it.each([
    ['bad timestamp', { pairCreatedAt: 'nope' }],
    ['numeric ms, not ISO', { pairCreatedAt: 1791892874000 }],
  ])(
    'resolves null for malformed pairCreatedAt (%s)',
    async (_label, extra) => {
      global.fetch = async () =>
        new Response(JSON.stringify({ ...BASE_SNAPSHOT, ...extra }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      const client = new MarketDataClient();
      const snapshot = await client.getSnapshot('solana', WENCAT);
      expect(snapshot?.pairCreatedAt).toBeNull();
    },
  );
});
