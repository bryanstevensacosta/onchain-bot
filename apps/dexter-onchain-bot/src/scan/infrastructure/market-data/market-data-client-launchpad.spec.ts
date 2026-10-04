import { MarketDataClient, toLaunchpadOrNull } from './market-data.client';

const CHALE_MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';

const CHALE_SNAPSHOT = {
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
  launchpad: {
    id: 'pump-fun',
    name: 'Pump.fun',
    url: `https://pump.fun/coin/${CHALE_MINT}`,
  },
};

describe('MarketDataClient.getSnapshot launchpad mapping (dexter-launchpad Lane S)', () => {
  const OLD_FETCH = global.fetch;

  afterEach(() => {
    global.fetch = OLD_FETCH;
    jest.restoreAllMocks();
  });

  it('maps a CHALE-shaped snapshot launchpad verbatim', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(CHALE_SNAPSHOT), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const client = new MarketDataClient();
    const snapshot = await client.getSnapshot('solana', CHALE_MINT);
    expect(snapshot?.launchpad).toEqual({
      id: 'pump-fun',
      name: 'Pump.fun',
      url: `https://pump.fun/coin/${CHALE_MINT}`,
    });
  });

  it('resolves null when the snapshot carries no launchpad', async () => {
    const { launchpad: _omitted, ...withoutLaunchpad } = CHALE_SNAPSHOT;
    global.fetch = async () =>
      new Response(JSON.stringify(withoutLaunchpad), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const client = new MarketDataClient();
    const snapshot = await client.getSnapshot('solana', CHALE_MINT);
    expect(snapshot?.launchpad).toBeNull();
  });

  it.each([
    ['missing url', { id: 'pump-fun', name: 'Pump.fun' }],
    ['empty id', { id: '', name: 'Pump.fun', url: 'https://pump.fun/coin/x' }],
    [
      'empty name',
      { id: 'pump-fun', name: '', url: 'https://pump.fun/coin/x' },
    ],
    ['empty url', { id: 'pump-fun', name: 'Pump.fun', url: '' }],
    [
      'non-string id',
      { id: 42, name: 'Pump.fun', url: 'https://pump.fun/coin/x' },
    ],
    ['string scalar', 'pump-fun'],
    ['array', [{ id: 'pump-fun', name: 'Pump.fun', url: 'https://x' }]],
  ])(
    'resolves null for malformed launchpad (%s), never passes opaque JSON',
    async (_label, launchpad) => {
      global.fetch = async () =>
        new Response(JSON.stringify({ ...CHALE_SNAPSHOT, launchpad }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      const client = new MarketDataClient();
      const snapshot = await client.getSnapshot('solana', CHALE_MINT);
      expect(snapshot?.launchpad).toBeNull();
    },
  );

  it('toLaunchpadOrNull rejects non-objects without throwing', () => {
    expect(toLaunchpadOrNull(null)).toBeNull();
    expect(toLaunchpadOrNull(undefined)).toBeNull();
    expect(toLaunchpadOrNull('pump-fun')).toBeNull();
    expect(toLaunchpadOrNull(42)).toBeNull();
  });
});
