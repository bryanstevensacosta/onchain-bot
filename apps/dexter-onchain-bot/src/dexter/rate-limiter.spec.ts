import { UserRateLimiter } from './rate-limiter';

describe('UserRateLimiter (per-user sliding window)', () => {
  it('allows up to the limit then blocks the same user', () => {
    const limiter = new UserRateLimiter(3);
    expect(limiter.isAllowed(111)).toBe(true);
    expect(limiter.isAllowed(111)).toBe(true);
    expect(limiter.isAllowed(111)).toBe(true);
    expect(limiter.isAllowed(111)).toBe(false);
  });

  it('budgets are independent per user', () => {
    const limiter = new UserRateLimiter(1);
    expect(limiter.isAllowed(111)).toBe(true);
    expect(limiter.isAllowed(222)).toBe(true);
    expect(limiter.isAllowed(111)).toBe(false);
    expect(limiter.isAllowed(222)).toBe(false);
  });
});
