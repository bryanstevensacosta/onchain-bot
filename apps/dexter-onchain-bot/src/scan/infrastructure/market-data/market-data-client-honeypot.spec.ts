import { MarketDataClient, toHoneypotOrNull } from './market-data.client';

const PAIR = '0x925061143Df8D59f5EB980A8cA33d649f0a4B4aC7';

const BASE_SNAPSHOT = {
  chain: 'bsc',
  address: PAIR,
  symbol: 'SAFEMOONCASH',
  name: 'SafeMoonCash',
  priceUsd: 0.00000001,
  priceChange24h: 1.5,
  marketCapUsd: 4_000_000,
  fdvUsd: 4_100_000,
  liquidityUsd: 900_000,
  lockedLiquidityPercent: null,
  burnedPercent: null,
  volume24hUsd: 150_000,
  holders: 1200,
  top10HolderPercent: 25.0,
  totalSupply: 1_000_000_000_000,
  circulatingSupply: 1_000_000_000_000,
  maxSupply: null,
  devWallets: null,
  devPctSupply: null,
  status: 'ready',
};

describe('MarketDataClient honeypot guard (plan todo 71 PASO 1)', () => {
  const OLD_FETCH = global.fetch;

  afterEach(() => {
    global.fetch = OLD_FETCH;
    jest.restoreAllMocks();
  });

  it('maps a honeypot reading verbatim (PERCENT sides + sim verdict)', async () => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          ...BASE_SNAPSHOT,
          honeypot: { buy: 0.04 * 100, sell: 0.02 * 100, sim: null },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const client = new MarketDataClient();
    const snapshot = await client.getSnapshot('bsc', PAIR);
    expect(snapshot?.honeypot).toEqual({ buy: 4, sell: 2, sim: null });
  });

  it('keeps a sim verdict exactly (`ok` / `fail`) and normalizes absent to null', async () => {
    global.fetch = async () =>
      new Response(
        JSON.stringify({
          ...BASE_SNAPSHOT,
          honeypot: { buy: 3, sell: null, sim: 'ok' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    const client = new MarketDataClient();
    expect((await client.getSnapshot('bsc', PAIR))?.honeypot).toEqual({
      buy: 3,
      sell: null,
      sim: 'ok',
    });

    global.fetch = async () =>
      new Response(
        JSON.stringify({
          ...BASE_SNAPSHOT,
          honeypot: { buy: null, sell: null, sim: 'fail' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    expect(
      (await new MarketDataClient().getSnapshot('bsc', PAIR))?.honeypot,
    ).toEqual({ buy: null, sell: null, sim: 'fail' });
  });

  it('resolves null when the snapshot carries no honeypot (older answers)', async () => {
    global.fetch = async () =>
      new Response(JSON.stringify(BASE_SNAPSHOT), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    const client = new MarketDataClient();
    expect((await client.getSnapshot('bsc', PAIR))?.honeypot).toBeNull();
  });

  it.each([
    ['out-of-range buy (101)', { buy: 101, sell: 2, sim: null }],
    ['negative buy', { buy: -0.01, sell: 2, sim: null }],
    ['string side', { buy: '3.99', sell: 2, sim: null }],
    ['boolean side', { buy: true, sell: 2, sim: null }],
    ['unknown sim verdict', { buy: 3, sell: 2, sim: 'OK' }],
    ['numeric sim', { buy: 3, sell: 2, sim: 1 }],
    ['malformed sim object', { buy: 3, sell: 2, sim: { success: true } }],
  ])(
    'resolves the whole object null on a contract violation (%s)',
    async (_label, honeypot) => {
      global.fetch = async () =>
        new Response(JSON.stringify({ ...BASE_SNAPSHOT, honeypot }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      const client = new MarketDataClient();
      const snapshot = await client.getSnapshot('bsc', PAIR);
      expect(snapshot?.honeypot).toBeNull();
    },
  );

  it('accepts the 0 and 100 bounds inclusive', () => {
    expect(toHoneypotOrNull({ buy: 0, sell: 100, sim: 'ok' })).toEqual({
      buy: 0,
      sell: 100,
      sim: 'ok',
    });
  });

  it('rejects NaN / Infinity / non-objects without throwing', () => {
    expect(toHoneypotOrNull({ buy: Number.NaN, sell: 2 })).toBeNull();
    expect(
      toHoneypotOrNull({ buy: Number.POSITIVE_INFINITY, sell: 2 }),
    ).toBeNull();
    expect(toHoneypotOrNull(null)).toBeNull();
    expect(toHoneypotOrNull(undefined)).toBeNull();
    expect(toHoneypotOrNull('honeypot')).toBeNull();
    expect(toHoneypotOrNull(42)).toBeNull();
    expect(toHoneypotOrNull([{ buy: 3, sell: 5 }])).toBeNull();
  });

  it('defaults sides to null when absent (Fase 1 shape)', () => {
    expect(toHoneypotOrNull({ buy: 4 })).toEqual({
      buy: 4,
      sell: null,
      sim: null,
    });
    expect(toHoneypotOrNull({})).toEqual({ buy: null, sell: null, sim: null });
  });
});
