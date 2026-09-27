import type { QuoteFetcher } from '../domain/snapshot-quote.types';
import { applyOutboundRateLimit } from './rate-limited-fetchers';

function fetcher(name: string): QuoteFetcher {
  return {
    name,
    supportsChains: ['solana'],
    fetch: async () => ({ priceUsd: 1 }),
  };
}

/**
 * Failing-first spec (Tramo 3, todo 14, anti-ban).
 *
 * Outbound gating wraps every fetcher: a denied bucket throws an
 * explicit rate-limited error (the aggregator records it in
 * `providerErrors` and the snapshot still merges the rest —
 * fail-open); a null limiter leaves fetchers untouched.
 */
describe('applyOutboundRateLimit (fail-open outbound gate)', () => {
  it('delegates when the bucket allows', async () => {
    const gated = applyOutboundRateLimit(
      [fetcher('dexscreener')],
      { tryAcquire: () => true },
      () => ({ limit: 60, windowMs: 60_000 }),
    );
    await expect(gated[0].fetch('solana', 'addr')).resolves.toEqual({
      priceUsd: 1,
    });
  });

  it('throws an explicit rate-limited error when the bucket denies', async () => {
    const seen: Array<{ key: string; limit: number; windowMs: number }> = [];
    const gated = applyOutboundRateLimit(
      [fetcher('birdeye')],
      {
        tryAcquire: (key: string, limit: number, windowMs: number) => {
          seen.push({ key, limit, windowMs });
          return false;
        },
      },
      () => ({ limit: 60, windowMs: 60_000 }),
    );
    await expect(gated[0].fetch('solana', 'addr')).rejects.toThrow(
      /birdeye.*outbound.*60\/min/,
    );
    expect(seen).toEqual([
      { key: 'outbound:birdeye', limit: 60, windowMs: 60_000 },
    ]);
  });

  it('passes a denied promise through as an explicit error too', async () => {
    const gated = applyOutboundRateLimit(
      [fetcher('moralis')],
      { tryAcquire: async () => false },
      () => ({ limit: 60, windowMs: 60_000 }),
    );
    await expect(gated[0].fetch('solana', 'addr')).rejects.toThrow(
      /moralis.*outbound/,
    );
  });

  it('leaves fetchers untouched when no limiter is wired', async () => {
    const inner = fetcher('rugcheck');
    const gated = applyOutboundRateLimit([inner], null, () => ({
      limit: 60,
      windowMs: 60_000,
    }));
    expect(gated[0]).toBe(inner);
  });
});
