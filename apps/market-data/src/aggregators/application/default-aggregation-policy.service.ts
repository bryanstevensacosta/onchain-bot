import { Injectable } from '@nestjs/common';
import {
  AggregationPolicyPort,
  type AggregationPolicyContext,
  type PolicyFetcherView,
} from '../domain/aggregation-policy.port';

/**
 * DefaultAggregationPolicyService (market-data restructure).
 *
 * Stable order preserving the fetcher-builder sequence (ccxt-first
 * where it covers comes from `buildProviderQuoteFetchers`); only
 * quota-exhausted or zero-credit providers sink last (stable among
 * themselves). Empty quota/credits is the identity — the pipeline
 * order is byte-identical to the pre-policy cascade.
 */
@Injectable()
export class DefaultAggregationPolicyService extends AggregationPolicyPort {
  public orderFetchers<T extends PolicyFetcherView>(
    fetchers: ReadonlyArray<T>,
    ctx: AggregationPolicyContext,
  ): ReadonlyArray<T> {
    const drained = (name: string): boolean => {
      if (ctx.quota[name]?.exhausted === true) {
        return true;
      }
      const credits = ctx.credits[name];
      return credits !== undefined && credits <= 0;
    };
    const healthy: Array<T> = [];
    const sunk: Array<T> = [];
    for (const fetcher of fetchers) {
      if (drained(fetcher.name)) {
        sunk.push(fetcher);
      } else {
        healthy.push(fetcher);
      }
    }
    return [...healthy, ...sunk];
  }
}
