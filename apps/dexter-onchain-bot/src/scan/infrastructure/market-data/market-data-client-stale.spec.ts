import {
  MarketDataClient,
  toStaleAgeMsOrNull,
  toStaleAsOfOrNull,
  toStaleOrFalse,
} from './market-data.client';

/**
 * Serve-stale contract (dexter plan todo 19b1): the client pins
 * `stale`/`staleAsOf`/`staleAgeMs` at the market-data boundary —
 * strict `true` only, ISO-gated as-of, finite non-negative age —
 * with fresh-shaped defaults so older market-data answers
 * (fields absent) keep resolving as fresh.
 */
describe('MarketDataClient stale trio (plan todo 19b1)', () => {
  const OLD_FETCH = global.fetch;

  afterEach(() => {
    global.fetch = OLD_FETCH;
    jest.restoreAllMocks();
  });

  function served(body: Record<string, unknown>) {
    global.fetch = async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
  }

  it('maps a stale replay verbatim (bit + as-of + age)', async () => {
    served({
      chain: 'solana',
      address: 'So1111',
      symbol: 'WIF',
      name: 'dogwifhat',
      status: 'ready',
      stale: true,
      staleAsOf: '2026-10-06T12:00:00.000Z',
      staleAgeMs: 3_600_000,
    });
    const snapshot = await new MarketDataClient().getSnapshot(
      'solana',
      'So1111',
    );
    expect(snapshot?.status).toBe('ready');
    expect(snapshot?.stale).toBe(true);
    expect(snapshot?.staleAsOf).toBe('2026-10-06T12:00:00.000Z');
    expect(snapshot?.staleAgeMs).toBe(3_600_000);
  });

  it('defaults absent stale fields to fresh-shaped false/null/null', async () => {
    served({
      chain: 'solana',
      address: 'So1111',
      symbol: 'WIF',
      name: 'dogwifhat',
      status: 'ready',
    });
    const snapshot = await new MarketDataClient().getSnapshot(
      'solana',
      'So1111',
    );
    expect(snapshot?.stale).toBe(false);
    expect(snapshot?.staleAsOf).toBeNull();
    expect(snapshot?.staleAgeMs).toBeNull();
  });

  it('rejects garbage stale values at the boundary (never trusted blindly)', () => {
    expect(toStaleOrFalse('yes')).toBe(false);
    expect(toStaleOrFalse(1)).toBe(false);
    expect(toStaleOrFalse(null)).toBe(false);
    expect(toStaleOrFalse(true)).toBe(true);
    expect(toStaleAsOfOrNull('garbage')).toBeNull();
    expect(toStaleAsOfOrNull('')).toBeNull();
    expect(toStaleAsOfOrNull('2026-10-06T12:00:00.000Z')).toBe(
      '2026-10-06T12:00:00.000Z',
    );
    expect(toStaleAgeMsOrNull(-5)).toBeNull();
    expect(toStaleAgeMsOrNull(Number.NaN)).toBeNull();
    expect(toStaleAgeMsOrNull('3600')).toBeNull();
    expect(toStaleAgeMsOrNull(0)).toBe(0);
    expect(toStaleAgeMsOrNull(3_600_000)).toBe(3_600_000);
  });
});
