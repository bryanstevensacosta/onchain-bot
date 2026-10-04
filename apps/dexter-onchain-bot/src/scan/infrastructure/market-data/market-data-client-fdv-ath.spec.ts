import {
  MarketDataClient,
  toFdvAthAtOrNull,
  toFdvAthUsdOrNull,
} from './market-data.client';

const CFB3 = '0xCfb3a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2';
const ATH_AT = '2024-09-24T12:00:00.000Z';

const BASE_SNAPSHOT = {
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
};

describe('toFdvAthUsdOrNull / toFdvAthAtOrNull (dexter client boundary)', () => {
  it('passes a finite value + ISO timestamp verbatim', () => {
    expect(toFdvAthUsdOrNull(5600)).toBe(5600);
    expect(toFdvAthAtOrNull(ATH_AT)).toBe(ATH_AT);
  });

  it.each([
    [null],
    [undefined],
    [Number.NaN],
    [Number.POSITIVE_INFINITY],
    ['5600'],
    [true],
  ])(
    'toFdvAthUsdOrNull resolves null for %s, never passes opaque JSON',
    (raw) => {
      expect(toFdvAthUsdOrNull(raw)).toBeNull();
    },
  );

  it.each([[null], [undefined], [''], ['not-a-date'], [12345], [true]])(
    'toFdvAthAtOrNull resolves null for %s, never passes opaque JSON',
    (raw) => {
      expect(toFdvAthAtOrNull(raw)).toBeNull();
    },
  );
});

describe('MarketDataClient.getSnapshot fdvAth mapping (plan todo 16)', () => {
  const OLD_FETCH = global.fetch;

  afterEach(() => {
    global.fetch = OLD_FETCH;
    jest.restoreAllMocks();
  });

  it('maps valid fdvAthUsd/fdvAthAt verbatim', async () => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          ...BASE_SNAPSHOT,
          fdvAthUsd: 5600,
          fdvAthAt: ATH_AT,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const client = new MarketDataClient();
    const snapshot = await client.getSnapshot('ethereum', CFB3);
    expect(snapshot?.fdvAthUsd).toBe(5600);
    expect(snapshot?.fdvAthAt).toBe(ATH_AT);
  });

  it('resolves nulls when the snapshot carries no ATH (cold-start)', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(BASE_SNAPSHOT), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const client = new MarketDataClient();
    const snapshot = await client.getSnapshot('ethereum', CFB3);
    expect(snapshot?.fdvAthUsd).toBeNull();
    expect(snapshot?.fdvAthAt).toBeNull();
  });

  it.each([
    ['NaN value', { fdvAthUsd: Number.NaN, fdvAthAt: ATH_AT }, 'fdvAthUsd'],
    ['string value', { fdvAthUsd: '5600', fdvAthAt: ATH_AT }, 'fdvAthUsd'],
    ['bad timestamp', { fdvAthUsd: 5600, fdvAthAt: 'nope' }, 'fdvAthAt'],
  ])(
    'resolves null for malformed ATH (%s), never passes opaque JSON',
    async (_label, ath, key) => {
      global.fetch = async () =>
        new Response(JSON.stringify({ ...BASE_SNAPSHOT, ...ath }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      const client = new MarketDataClient();
      const snapshot = await client.getSnapshot('ethereum', CFB3);
      expect(snapshot?.[key as 'fdvAthUsd']).toBeNull();
    },
  );
});
