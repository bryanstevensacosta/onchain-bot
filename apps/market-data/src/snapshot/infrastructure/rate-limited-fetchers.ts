import type { RateLimiterPort } from 'rate-limiter/domain/rate-limiter.port';
import {
  buildOutboundKey,
  type ProviderOutboundBudget,
} from 'rate-limiter/domain/provider-outbound-limits';
import type { QuoteFetcher } from '../domain/snapshot-quote.types';

/**
 * Outbound rate-limit gate for the snapshot fan-out
 * (Tramo 3, todo 14, anti-ban).
 *
 * Every fetcher is checked against its per-provider token bucket
 * BEFORE touching the network. A denied bucket throws an explicit
 * rate-limited error: the aggregator records it in `providerErrors`
 * and the snapshot still merges every other provider (fail-open at
 * the snapshot level). A null limiter leaves fetchers untouched —
 * the gate only exists when the budget is wired.
 */
export function applyOutboundRateLimit(
  fetchers: ReadonlyArray<QuoteFetcher>,
  limiter: Pick<RateLimiterPort, 'tryAcquire'> | null,
  resolveBudget: (name: string) => ProviderOutboundBudget,
): ReadonlyArray<QuoteFetcher> {
  if (limiter === null || limiter === undefined) {
    return fetchers;
  }
  return fetchers.map((fetcher) => ({
    ...fetcher,
    fetch: async (chain: string, address: string) => {
      const budget = resolveBudget(fetcher.name);
      const allowed = await limiter.tryAcquire(
        buildOutboundKey(fetcher.name),
        budget.limit,
        budget.windowMs,
      );
      if (!allowed) {
        throw new Error(
          `${fetcher.name} outbound budget exceeded (${budget.limit}/min) — skipped, fail-open`,
        );
      }
      return fetcher.fetch(chain, address);
    },
  }));
}
