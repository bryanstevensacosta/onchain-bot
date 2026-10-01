/**
 * @deprecated Canonical home is
 * `src/shared/infrastructure/rate-limiter/application/rate-limiter.service.ts` (market-data restructure: cache/rate-limiter live under shared/infrastructure/). Compat re-export so `rate-limiter/*` consumers keep
 * working unchanged. Removed at cutover (todo 8).
 */
export * from '../shared/infrastructure/rate-limiter/application/rate-limiter.service';
