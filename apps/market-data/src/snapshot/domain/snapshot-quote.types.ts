/**
 * Snapshot quote types (Tramo 3, todo-3 aggregation gap).
 *
 * The live-price aggregation contract: every supporting provider is
 * fanned out in parallel and the first non-null value per field wins.
 * `SnapshotQuote` is the merged, all-nullable price view; `QuoteFetcher`
 * is the per-provider fetch shape the aggregator runs (adapters stay
 * untouched — thin wrappers in `snapshot/infrastructure/` adapt their
 * existing public methods to this shape).
 */
export interface SnapshotQuote {
  readonly priceUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  readonly priceChange24h: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  readonly symbol: string | null;
  readonly name: string | null;
  readonly lockedLiquidityPercent: number | null;
  readonly burnedPercent: number | null;
  readonly totalSupply: number | null;
  readonly circulatingSupply: number | null;
  readonly maxSupply: number | null;
}

export const SNAPSHOT_QUOTE_FIELDS: ReadonlyArray<keyof SnapshotQuote> = [
  'priceUsd',
  'marketCapUsd',
  'fdvUsd',
  'liquidityUsd',
  'volume24hUsd',
  'priceChange24h',
  'holders',
  'top10HolderPercent',
  'symbol',
  'name',
  'lockedLiquidityPercent',
  'burnedPercent',
  'totalSupply',
  'circulatingSupply',
  'maxSupply',
];

export function emptySnapshotQuote(): SnapshotQuote {
  return {
    priceUsd: null,
    marketCapUsd: null,
    fdvUsd: null,
    liquidityUsd: null,
    volume24hUsd: null,
    priceChange24h: null,
    holders: null,
    top10HolderPercent: null,
    symbol: null,
    name: null,
    lockedLiquidityPercent: null,
    burnedPercent: null,
    totalSupply: null,
    circulatingSupply: null,
    maxSupply: null,
  };
}

/**
 * One provider's fetch step. `name` MUST match the provider registry
 * descriptor (so health recording + the `providers` hint list stay
 * consistent); `supportsChains` mirrors the descriptor's chain list.
 */
export interface QuoteFetcher {
  readonly name: string;
  readonly supportsChains: ReadonlyArray<string>;
  fetch(
    chain: string,
    address: string,
  ): Promise<Partial<SnapshotQuote> | null>;
}

/** DI token for the ordered fetcher list (registry order: dex first). */
export const SNAPSHOT_QUOTE_PROVIDERS = 'SNAPSHOT_QUOTE_PROVIDERS';

/** Per-call ceiling for one provider fetch (adapters use 5-8s axios). */
export const SNAPSHOT_PROVIDER_TIMEOUT_MS = 8_000;

/** Hot-result cache TTL in seconds (mirrors the 30s edge cache). */
export const SNAPSHOT_CACHE_TTL_SECONDS = 30;
