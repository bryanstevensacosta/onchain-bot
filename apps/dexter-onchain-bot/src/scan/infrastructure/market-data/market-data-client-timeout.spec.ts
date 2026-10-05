import { MarketDataClient } from './market-data.client';

/**
 * Timeout budget (plan todo 19a): the default per-call budget is 10s
 * (Telegram tolerates ~60s; cold market-data fan-out takes ~2s) —
 * configurable via `MARKET_DATA_TIMEOUT_MS`, never hardcoded.
 */
describe('MarketDataClient timeout default (plan todo 19a)', () => {
  const OLD_ENV = process.env['MARKET_DATA_TIMEOUT_MS'];
  const OLD_FETCH = global.fetch;

  afterEach(() => {
    if (OLD_ENV === undefined) {
      delete process.env['MARKET_DATA_TIMEOUT_MS'];
    } else {
      process.env['MARKET_DATA_TIMEOUT_MS'] = OLD_ENV;
    }
    global.fetch = OLD_FETCH;
    jest.restoreAllMocks();
  });

  function okFetch() {
    global.fetch = async () =>
      new Response(JSON.stringify({ symbol: 'TKN', name: 'Token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
  }

  it('schedules the abort at 10s by default when the env is unset', async () => {
    delete process.env['MARKET_DATA_TIMEOUT_MS'];
    okFetch();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const client = new MarketDataClient();
    const snapshot = await client.getSnapshot('solana', 'So1111');
    expect(snapshot?.symbol).toBe('TKN');
    const delays = setTimeoutSpy.mock.calls.map((call) => call[1]);
    expect(delays).toContain(10_000);
  });

  it('honors an explicit MARKET_DATA_TIMEOUT_MS override', async () => {
    process.env['MARKET_DATA_TIMEOUT_MS'] = '250';
    okFetch();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const client = new MarketDataClient();
    await client.getSnapshot('solana', 'So1111');
    const delays = setTimeoutSpy.mock.calls.map((call) => call[1]);
    expect(delays).toContain(250);
  });

  it('falls back to 10s on a non-numeric env value', async () => {
    process.env['MARKET_DATA_TIMEOUT_MS'] = 'not-a-number';
    okFetch();
    const setTimeoutSpy = jest.spyOn(global, 'setTimeout');
    const client = new MarketDataClient();
    await client.getSnapshot('solana', 'So1111');
    const delays = setTimeoutSpy.mock.calls.map((call) => call[1]);
    expect(delays).toContain(10_000);
  });
});
