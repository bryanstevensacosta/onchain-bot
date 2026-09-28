import type { RateLimiterPort } from 'rate-limiter/domain/rate-limiter.port';
import { resolveEndpointCost } from 'provider/domain/provider-limiter-config';
import {
  buildOutboundKey,
  type ProviderOutboundBudget,
} from 'rate-limiter/domain/provider-outbound-limits';
import type { QuoteFetcher } from 'snapshot/domain/snapshot-quote.types';

/**
 * Outbound rate-limit gate for the snapshot fan-out
 * (Tramo 3, todo 14, anti-ban; cost-aware + coverage-skip todo 16).
 *
 * Every fetcher is checked against its per-provider token bucket
 * BEFORE touching the network, burning one slot per unit of endpoint
 * cost (P48-bis: heavy endpoints consume more). A denied bucket throws
 * an explicit rate-limited error: the aggregator records it in
 * `providerErrors` and the snapshot still merges every other provider
 * (fail-open at the snapshot level). Fetchers that do not cover the
 * input (`covers`, e.g. ccxt on onchain addresses) skip the bucket
 * entirely — uncovered inputs burn zero quota. A null limiter leaves
 * fetchers untouched — the gate only exists when the budget is wired.
 */
export function applyOutboundRateLimit(
  fetchers: ReadonlyArray<QuoteFetcher>,
  limiter: Pick<RateLimiterPort, 'tryAcquire'> | null,
  resolveBudget: (
    name: string,
    endpoint: string | undefined,
  ) => ProviderOutboundBudget,
): ReadonlyArray<QuoteFetcher> {
  if (limiter === null || limiter === undefined) {
    return fetchers;
  }
  return fetchers.map((fetcher) => ({
    ...fetcher,
    fetch: async (chain: string, address: string) => {
      if (fetcher.covers !== undefined && !fetcher.covers(chain, address)) {
        return fetcher.fetch(chain, address);
      }
      const budget = resolveBudget(fetcher.name, fetcher.endpoint);
      const cost =
        fetcher.limiterConfig !== undefined
          ? resolveEndpointCost(fetcher.limiterConfig, fetcher.endpoint)
          : (budget.cost ?? 1);
      for (let slot = 0; slot < cost; slot += 1) {
        const allowed = await limiter.tryAcquire(
          buildOutboundKey(fetcher.name),
          budget.limit,
          budget.windowMs,
        );
        if (!allowed) {
          throw new Error(
            `${fetcher.name} outbound budget exceeded (${budget.limit}/min, cost ${cost}) — skipped, fail-open`,
          );
        }
      }
      return fetcher.fetch(chain, address);
    },
  }));
}
