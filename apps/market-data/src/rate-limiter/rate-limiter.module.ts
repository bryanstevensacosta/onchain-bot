/**
 * @deprecated Canonical home is
 * `src/shared/infrastructure/rate-limiter/rate-limiter.module.ts`
 * (market-data restructure: rate-limiter lives under
 * shared/infrastructure/). Compat re-export so `rate-limiter/*`
 * consumers keep working unchanged. Removed at cutover (todo 8).
 */
export * from '../shared/infrastructure/rate-limiter/rate-limiter.module';
