import type { QuoteFetcher } from 'snapshot/domain/snapshot-quote.types';
import { RetryableProviderError } from '../../domain/retryable-provider.error';
import {
  applySingleRetryFetchers,
  computeRetryDelayMs,
  FETCHER_RETRY_CAP_MS,
} from './fetcher-retry';

function fetcher(
  name: string,
  impl: (
    call: number,
  ) => Promise<Partial<
    import('snapshot/domain/snapshot-quote.types').SnapshotQuote
  > | null>,
): QuoteFetcher & { calls: () => number } {
  let calls = 0;
  const inner: QuoteFetcher = {
    name,
    supportsChains: ['solana'],
    fetch: async (_chain: string, _address: string) => {
      calls += 1;
      return impl(calls);
    },
  };
  const wrapped = applySingleRetryFetchers([inner], {
    sleep: async () => undefined,
  })[0];
  return Object.assign(wrapped, { calls: () => calls });
}

function retryable(provider = 'dexscreener'): RetryableProviderError {
  return new RetryableProviderError(provider, 'server', 0, 503);
}

describe('computeRetryDelayMs (cap + full jitter)', () => {
  it('caps a 120s Retry-After at 2000ms and bounds the wait at 2x cap', () => {
    const { cappedMs, delayMs } = computeRetryDelayMs(120_000, () => 0.9999);
    expect(cappedMs).toBe(FETCHER_RETRY_CAP_MS);
    expect(delayMs).toBeGreaterThanOrEqual(2_000);
    expect(delayMs).toBeLessThanOrEqual(4_000);
  });

  it('passes small headers through with proportional jitter', () => {
    const { cappedMs, delayMs } = computeRetryDelayMs(500, () => 0);
    expect(cappedMs).toBe(500);
    expect(delayMs).toBe(500);
  });

  it('zero header (timeout / live retry-after: 0) retries immediately', () => {
    const { cappedMs, delayMs } = computeRetryDelayMs(0, () => 0.5);
    expect(cappedMs).toBe(0);
    expect(delayMs).toBe(0);
  });
});

describe('applySingleRetryFetchers (exactly-one retry)', () => {
  it('passes values through with a single call (no retry on success)', async () => {
    const f = fetcher('dexscreener', async () => ({ priceUsd: 1 }));
    await expect(f.fetch('solana', 'addr')).resolves.toEqual({ priceUsd: 1 });
    expect(f.calls()).toBe(1);
  });

  it('NEVER retries null (404 / no-data collapses before the wrapper)', async () => {
    const f = fetcher('geckoterminal', async () => null);
    await expect(f.fetch('solana', 'addr')).resolves.toBeNull();
    expect(f.calls()).toBe(1);
  });

  it('retries EXACTLY ONCE on a retryable throw, then returns the recovery', async () => {
    const f = fetcher('dexscreener', async (call) => {
      if (call === 1) throw retryable();
      return { priceUsd: 2 };
    });
    await expect(f.fetch('solana', 'addr')).resolves.toEqual({ priceUsd: 2 });
    expect(f.calls()).toBe(2);
  });

  it('second failure returns null with NO third attempt (fail-open)', async () => {
    const f = fetcher('birdeye', async () => {
      throw retryable('birdeye');
    });
    await expect(f.fetch('solana', 'addr')).resolves.toBeNull();
    expect(f.calls()).toBe(2);
  });

  it('recovers to null (not a throw) when the retry itself finds no data', async () => {
    const f = fetcher('mobula', async (call) => {
      if (call === 1) throw retryable('mobula');
      return null;
    });
    await expect(f.fetch('solana', 'addr')).resolves.toBeNull();
    expect(f.calls()).toBe(2);
  });

  it('RETHROWS non-retryable errors untouched (outbound-deny signal survives)', async () => {
    const deny = new Error(
      'rugcheck outbound budget exceeded (60/min, cost 1) — skipped, fail-open',
    );
    const f = fetcher('rugcheck', async () => {
      throw deny;
    });
    await expect(f.fetch('solana', 'addr')).rejects.toBe(deny);
    expect(f.calls()).toBe(1);
  });

  it('RETHROWS programming errors untouched (never swallowed to null)', async () => {
    const bug = new TypeError('cannot read property');
    const f = fetcher('moralis', async () => {
      throw bug;
    });
    await expect(f.fetch('solana', 'addr')).rejects.toBe(bug);
    expect(f.calls()).toBe(1);
  });

  it('waits min(header, cap) + jitter before the retry (120s → ≤4s, never 120s)', async () => {
    const seen: number[] = [];
    const inner: QuoteFetcher = {
      name: 'coingecko',
      supportsChains: ['solana'],
      fetch: async () => {
        if (seen.length === 0) {
          throw new RetryableProviderError(
            'coingecko',
            'rate-limited',
            120_000,
            429,
          );
        }
        return { priceUsd: 3 };
      },
    };
    const [wrapped] = applySingleRetryFetchers([inner], {
      sleep: async (ms: number) => {
        seen.push(ms);
      },
      random: () => 1,
    });
    await expect(wrapped.fetch('solana', 'addr')).resolves.toEqual({
      priceUsd: 3,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeGreaterThanOrEqual(2_000);
    expect(seen[0]).toBeLessThanOrEqual(4_000);
  });
});

describe('jitter decorrelation (statistical proof)', () => {
  it('spreads retry waits across the full capped band (no thundering herd)', () => {
    const spy = jest.spyOn(Math, 'random');
    const samples: number[] = [];
    for (let i = 0; i < 200; i += 1) {
      samples.push(computeRetryDelayMs(2_000).delayMs);
    }
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    const min = Math.min(...samples);
    const max = Math.max(...samples);
    // Full-jitter band is [2000, 4000]; 200 uniform draws spread >1000
    // apart with probability 1 - ~2^-199 — deterministic in practice.
    expect(max - min).toBeGreaterThan(1_000);
    expect(min).toBeGreaterThanOrEqual(2_000);
    expect(max).toBeLessThanOrEqual(4_000);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(2_500);
    expect(mean).toBeLessThan(3_500);
  });
});
