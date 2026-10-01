import { Test } from '@nestjs/testing';
import { RateLimiterModule } from './rate-limiter.module';

describe('RateLimiterModule', () => {
  it('boots as a stub (sliding window + breaker land in todo 2)', async () => {
    const module = await Test.createTestingModule({
      imports: [RateLimiterModule],
    }).compile();
    expect(module.get(RateLimiterModule)).toBeDefined();
  });
});
