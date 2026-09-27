import { Global, Module } from '@nestjs/common';
import { RateLimiterService } from './application/rate-limiter.service';
import { CircuitBreakerService } from './application/circuit-breaker.service';
import { RateLimiterPort } from './domain/rate-limiter.port';
import { RedisTokenBucketAdapter } from './infrastructure/redis-token-bucket.adapter';

/**
 * RateLimiterModule (Tramo 3, todo 2; hexagonal layout todo 12, P50;
 * Redis token-bucket todo 14, GAP-3).
 *
 * Global sliding-window limiter + circuit breaker. Pre-call gate for
 * the todo-3 aggregator cascades; edge HTTP policy lives in
 * src/gateway/. The centralized `RateLimiterPort` resolves to the
 * Redis token-bucket when `REDIS_URL` is set, else to the in-memory
 * service — same contract, no consumer change.
 */
@Global()
@Module({
  providers: [
    RateLimiterService,
    CircuitBreakerService,
    RedisTokenBucketAdapter,
    {
      provide: RateLimiterPort,
      inject: [RateLimiterService, RedisTokenBucketAdapter],
      useFactory: (
        memory: RateLimiterService,
        redis: RedisTokenBucketAdapter,
      ): RateLimiterPort =>
        process.env.REDIS_URL ? redis : memory,
    },
  ],
  exports: [RateLimiterService, CircuitBreakerService, RateLimiterPort],
})
export class RateLimiterModule {}
