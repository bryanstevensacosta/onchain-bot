/**
 * AggregationPolicyPort (market-data restructure).
 *
 * Owns the ORDERED provider list for one snapshot aggregation from its
 * context: the address kind + chain + requested fields select the pool,
 * while the per-provider quota state (token-bucket snapshot) and the
 * account credits deprioritize drained providers. Eligibility
 * (`supportsChains`) and coverage (`covers`) stay with the fetchers and
 * the merge stays first-non-null — the policy only orders, never
 * filters, so an empty quota/credits context is the identity.
 */
export interface ProviderQuotaState {
  /** True when the provider's outbound bucket is currently drained. */
  readonly exhausted: boolean;
  /** Remaining budget units, when known. */
  readonly remaining?: number;
}

export interface AggregationPolicyContext {
  /** Address kind under aggregation (token | wallet | program | ...). */
  readonly kind: string;
  /** Catalog chain id (e.g. `solana`). */
  readonly chain: string;
  /** Raw address under aggregation (coverage gates need it). */
  readonly address: string;
  /** Requested snapshot fields (default: all). */
  readonly fields: ReadonlyArray<string>;
  /** Per-provider quota snapshot, by registry name. */
  readonly quota: Readonly<Record<string, ProviderQuotaState>>;
  /** Per-provider account credits, by registry name. */
  readonly credits: Readonly<Record<string, number>>;
}

/** Minimal fetcher view the policy orders (structural subset of QuoteFetcher). */
export interface PolicyFetcherView {
  readonly name: string;
  readonly supportsChains: ReadonlyArray<string>;
  readonly covers?: (chain: string, address: string) => boolean;
}

export abstract class AggregationPolicyPort {
  abstract orderFetchers<T extends PolicyFetcherView>(
    fetchers: ReadonlyArray<T>,
    ctx: AggregationPolicyContext,
  ): ReadonlyArray<T>;
}
