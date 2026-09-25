import { Global, Module } from '@nestjs/common';
import { RateLimiterService } from './application/rate-limiter.service';
import { CircuitBreakerService } from './application/circuit-breaker.service';

/**
 * RateLimiterModule (Tramo 3, todo 2; hexagonal layout todo 12, P50).
 *
 * Global sliding-window limiter + circuit breaker. Pre-call gate for
 * the todo-3 aggregator cascades; edge HTTP policy lives in
 * src/gateway/.
 */
@Global()
@Module({
  providers: [RateLimiterService, CircuitBreakerService],
  exports: [RateLimiterService, CircuitBreakerService],
})
export class RateLimiterModule {}
