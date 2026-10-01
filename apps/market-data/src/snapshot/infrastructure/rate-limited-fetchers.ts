/**
 * @deprecated Canonical home is
 * `src/provider/infrastructure/quote-fetchers/rate-limited-fetchers.ts`
 * (market-data restructure: the outbound gate lives with the
 * provider). Compat re-export so `snapshot/*` consumers keep working
 * unchanged. Removed at cutover (todo 8).
 */
export * from 'provider/infrastructure/quote-fetchers/rate-limited-fetchers';
