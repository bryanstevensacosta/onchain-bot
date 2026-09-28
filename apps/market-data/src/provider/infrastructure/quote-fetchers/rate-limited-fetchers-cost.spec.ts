import { RateLimiterService } from 'rate-limiter/application/rate-limiter.service';
import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import type { QuoteFetcher } from 'snapshot/domain/snapshot-quote.types';
import { applyOutboundRateLimit } from './rate-limited-fetchers';

function fetcher(name: string, cost?: number): QuoteFetcher {
  return {
    name,
    supportsChains: ['solana'],
    endpoint: 'quote',
    fetch: async () => ({ priceUsd: 1 }),
    ...(cost === undefined ? {} : { limiterConfig: {
      windowMs: 60_000,
      limitPerWindow: 60,
      endpointCosts: { quote: cost },
      backoffInitialMs: 1_000,
      backoffMaxMs: 30_000,
    } }),
  };
}

/**
 * Failing-first spec (Tramo 3, todo 16, P48-bis + adversarial).
 *
 * Fetchers honour per-endpoint costs (one heavy call burns several
 * bucket slots); a denied bucket is an explicit fail-open error, never
 * a failed snapshot; uncovered inputs skip the bucket entirely (zero
 * quota burn). The adversarial case breaches the quota on a REAL
 * sliding-window limiter and proves the cascade still merges the rest.
 */
describe('quota respect per provider (P48-bis)', () => {
  it('burns one bucket slot per unit of endpoint cost', async () => {
    let calls = 0;
    const gated = applyOutboundRateLimit(
      [fetcher('ccxt', 5)],
      {
        tryAcquire: () => {
          calls += 1;
          return true;
        },
      },
      () => ({ limit: 600, windowMs: 60_000 }),
    );
    await gated[0].fetch('solana', 'BTC/USDT');
    expect(calls).toBe(5);
  });

  it('denies with an explicit fail-open error naming cost and quota', async () => {
    const gated = applyOutboundRateLimit(
      [fetcher('ccxt', 5)],
      { tryAcquire: () => false },
      () => ({ limit: 600, windowMs: 60_000 }),
    );
    await expect(gated[0].fetch('solana', 'BTC/USDT')).rejects.toThrow(
      /ccxt.*outbound.*600\/min.*cost 5.*fail-open/,
    );
  });

  it('skips the bucket entirely when the fetcher does not cover the input', async () => {
    let calls = 0;
    const inner: QuoteFetcher = {
      name: 'ccxt',
      supportsChains: ['solana'],
      covers: (chain, address) => address.includes('/'),
      fetch: async () => null,
    };
    const gated = applyOutboundRateLimit(
      [inner],
      {
        tryAcquire: () => {
          calls += 1;
          return true;
        },
      },
      () => ({ limit: 600, windowMs: 60_000 }),
    );
    await expect(
      gated[0].fetch('solana', 'So11111111111111111111111111111111111111112'),
    ).resolves.toBeNull();
    expect(calls).toBe(0);
  });

  it('ADVERSARIAL: quota breach on a real limiter still merges the rest', async () => {
    const limiter = new RateLimiterService();
    const dex: QuoteFetcher = {
      name: 'dexscreener',
      supportsChains: ['solana'],
      endpoint: 'quote',
      fetch: async () => ({ priceUsd: 9.99 }),
    };
    const gecko: QuoteFetcher = {
      name: 'geckoterminal',
      supportsChains: ['solana'],
      endpoint: 'quote',
      fetch: async () => ({ holders: 1234 }),
    };
    const gated = applyOutboundRateLimit(
      [dex, gecko],
      limiter,
      (name: string) => ({
        limit: name === 'dexscreener' ? 1 : 60,
        windowMs: 60_000,
      }),
    );
    // Breach the dexscreener bucket on the real sliding window.
    await gated[0].fetch('solana', 'addr');
    const aggregator = new SnapshotAggregatorService();
    const outcome = await aggregator.aggregate('solana', 'addr', gated);
    expect(outcome.allFailed).toBe(false);
    expect(outcome.sources).toEqual(['geckoterminal']);
    expect(outcome.quote.holders).toBe(1234);
    expect(outcome.errors.dexscreener).toMatch(/outbound budget exceeded/);
  });
});
