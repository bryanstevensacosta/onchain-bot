import { MarketDataClient, toDegradedOrFalse } from './market-data.client';

/**
 * Tail-degraded contract (dexter plan todo 41b): the client pins
 * `degraded` at the market-data boundary — strict `true` only, with a
 * full-shaped default so older market-data answers (field absent)
 * keep resolving as full.
 */
describe('MarketDataClient degraded marker (plan todo 41)', () => {
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

  it('maps a degraded card verbatim (bit only, no age semantics)', async () => {
    served({
      chain: 'solana',
      address: 'So1111',
      symbol: 'WIF',
      name: 'dogwifhat',
      status: 'ready',
      stale: false,
      staleAsOf: null,
      staleAgeMs: null,
      degraded: true,
    });
    const snapshot = await new MarketDataClient().getSnapshot(
      'solana',
      'So1111',
    );
    expect(snapshot?.status).toBe('ready');
    expect(snapshot?.degraded).toBe(true);
    expect(snapshot?.stale).toBe(false);
  });

  it('defaults an absent degraded field to full-shaped false', async () => {
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
    expect(snapshot?.degraded).toBe(false);
  });

  it('rejects garbage degraded values at the boundary (never trusted blindly)', () => {
    expect(toDegradedOrFalse('yes')).toBe(false);
    expect(toDegradedOrFalse(1)).toBe(false);
    expect(toDegradedOrFalse(null)).toBe(false);
    expect(toDegradedOrFalse(undefined)).toBe(false);
    expect(toDegradedOrFalse(true)).toBe(true);
  });
});
