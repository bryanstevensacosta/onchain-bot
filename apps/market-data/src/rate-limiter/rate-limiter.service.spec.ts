import { RateLimiterService } from './rate-limiter.service';

/**
 * Failing-first spec (Tramo 3, todo 2): sliding-window rate limiter.
 */
describe('RateLimiterService', () => {
  it('allows up to the limit within the window', () => {
    const limiter = new RateLimiterService();
    expect(limiter.tryAcquire('k', 2, 60_000, 1000)).toBe(true);
    expect(limiter.tryAcquire('k', 2, 60_000, 1001)).toBe(true);
    expect(limiter.tryAcquire('k', 2, 60_000, 1002)).toBe(false);
  });

  it('slides: an old hit falling out frees budget', () => {
    const limiter = new RateLimiterService();
    expect(limiter.tryAcquire('k', 1, 1000, 0)).toBe(true);
    expect(limiter.tryAcquire('k', 1, 1000, 500)).toBe(false);
    expect(limiter.tryAcquire('k', 1, 1000, 1001)).toBe(true);
  });

  it('tracks keys independently', () => {
    const limiter = new RateLimiterService();
    expect(limiter.tryAcquire('a', 1, 60_000, 0)).toBe(true);
    expect(limiter.tryAcquire('b', 1, 60_000, 0)).toBe(true);
    expect(limiter.tryAcquire('a', 1, 60_000, 1)).toBe(false);
  });
});
