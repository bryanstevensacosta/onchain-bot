import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';
import { PublishRateLimitService } from './publish-rate-limit.service';

describe('PublishRateLimitService (todo 23, P50, failing-first)', () => {
  function withLimit(n: number): PublishRateLimitService {
    const limiter = new PublishRateLimitService();
    limiter.setLimitForTests(n);
    return limiter;
  }

  it('allows under the limit and blocks over it with RATE_LIMITED', () => {
    const limiter = withLimit(2);
    limiter.checkOrThrow('owner-a:tpl-1', 1_000);
    limiter.checkOrThrow('owner-a:tpl-1', 1_001);
    try {
      limiter.checkOrThrow('owner-a:tpl-1', 1_002);
      fail('expected RATE_LIMITED');
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe(ErrorCode.RATE_LIMITED);
    }
  });

  it('tracks keys independently and resets after the window', () => {
    const limiter = withLimit(1);
    limiter.checkOrThrow('a:t', 0);
    expect(() => limiter.checkOrThrow('b:t', 1)).not.toThrow();
    expect(() => limiter.checkOrThrow('a:t', 60_001)).not.toThrow();
  });
});
