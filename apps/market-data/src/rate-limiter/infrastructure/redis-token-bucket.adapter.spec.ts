import { RateLimiterPort } from '../domain/rate-limiter.port';
import {
  RedisTokenBucketAdapter,
  computeTokenBucket,
} from './redis-token-bucket.adapter';

/**
 * Failing-first spec (Tramo 3, todo 14, anti-ban).
 *
 * Redis token-bucket infra behind the centralized `RateLimiterPort`:
 * the bucket math denies excess and refills over time; a Redis outage
 * fails OPEN (allows the call) so a down Redis never blocks snapshots.
 */
describe('RedisTokenBucketAdapter (token-bucket + fail-open)', () => {
  it('implements the centralized RateLimiterPort', () => {
    const adapter = new RedisTokenBucketAdapter(null);
    expect(adapter).toBeInstanceOf(RateLimiterPort);
  });

  it('denies excess: capacity 2 allows 2 then denies the 3rd', () => {
    const now = 1_000_000;
    const first = computeTokenBucket(null, now, 2, 60_000);
    expect(first.allowed).toBe(true);
    const second = computeTokenBucket(first.state, now, 2, 60_000);
    expect(second.allowed).toBe(true);
    const third = computeTokenBucket(second.state, now, 2, 60_000);
    expect(third.allowed).toBe(false);
    expect(third.state.tokens).toBe(0);
  });

  it('refills one token per window slice', () => {
    const now = 1_000_000;
    const empty = { tokens: 0, updatedAt: now };
    const refilled = computeTokenBucket(empty, now + 30_000, 2, 60_000);
    expect(refilled.allowed).toBe(true);
    expect(refilled.state.tokens).toBe(0);
  });

  it('fails OPEN when Redis throws (never blocks snapshots)', async () => {
    const broken = {
      eval: async () => {
        throw new Error('ECONNREFUSED');
      },
    };
    const adapter = new RedisTokenBucketAdapter(
      broken as unknown as never,
    );
    await expect(
      adapter.tryAcquire('outbound:dexscreener', 60, 60_000),
    ).resolves.toBe(true);
  });

  it('denies excess through the port when Redis runs the script', async () => {
    let tokens = 1;
    const memory = {
      eval: async () => {
        if (tokens <= 0) {
          return 0;
        }
        tokens -= 1;
        return 1;
      },
    };
    const adapter = new RedisTokenBucketAdapter(
      memory as unknown as never,
    );
    await expect(adapter.tryAcquire('k', 1, 60_000)).resolves.toBe(true);
    await expect(adapter.tryAcquire('k', 1, 60_000)).resolves.toBe(false);
  });
});
