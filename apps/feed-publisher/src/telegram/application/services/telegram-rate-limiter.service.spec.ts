import { TelegramRateLimiter } from './telegram-rate-limiter.service';

describe('TelegramRateLimiter', () => {
  it('allows up to the per-minute limit inside one window', () => {
    const limiter = new TelegramRateLimiter(2);
    const now = new Date('2026-09-25T00:00:00.000Z');
    expect(limiter.tryAcquire(now)).toBe(true);
    expect(limiter.tryAcquire(now)).toBe(true);
    expect(limiter.tryAcquire(now)).toBe(false);
  });

  it('resets the budget when the 60s window rolls over', () => {
    const limiter = new TelegramRateLimiter(1);
    const start = new Date('2026-09-25T00:00:00.000Z');
    expect(limiter.tryAcquire(start)).toBe(true);
    expect(limiter.tryAcquire(start)).toBe(false);
    const nextWindow = new Date('2026-09-25T00:01:00.000Z');
    expect(limiter.tryAcquire(nextWindow)).toBe(true);
  });

  it('falls back to the shared default when the configured value is unusable', () => {
    const limiter = new TelegramRateLimiter(Number.NaN);
    const now = new Date('2026-09-25T00:00:00.000Z');
    for (let i = 0; i < 20; i += 1) {
      expect(limiter.tryAcquire(now)).toBe(true);
    }
    expect(limiter.tryAcquire(now)).toBe(false);
  });
});
