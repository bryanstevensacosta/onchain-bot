import { ErrorCode } from 'shared/kernel/domain-error';
import { PublishRateLimiter } from './publish-rate-limiter.service';

describe('PublishRateLimiter (todo 14, P50)', () => {
  it('allows up to the limit then refuses with RATE_LIMITED', () => {
    const limiter = new PublishRateLimiter(2, 60_000);
    limiter.check('tab-news');
    limiter.check('tab-news');
    expect(() => limiter.check('tab-news')).toThrow(
      expect.objectContaining({ code: ErrorCode.RATE_LIMITED }),
    );
  });

  it('scopes budgets per session (one tab never starves another)', () => {
    const limiter = new PublishRateLimiter(1, 60_000);
    limiter.check('tab-a');
    expect(() => limiter.check('tab-b')).not.toThrow();
  });

  it('releases the budget after the window rolls over', () => {
    const limiter = new PublishRateLimiter(1, 1_000);
    limiter.check('tab-a');
    expect(() => limiter.check('tab-a')).toThrow(
      expect.objectContaining({ code: ErrorCode.RATE_LIMITED }),
    );
    expect(() =>
      limiter.check('tab-a', new Date(Date.now() + 1_001)),
    ).not.toThrow();
  });
});
