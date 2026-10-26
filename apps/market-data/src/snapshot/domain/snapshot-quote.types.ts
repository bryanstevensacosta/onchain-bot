/**
 * Snapshot quote types (Tramo 3, todo-3 aggregation gap).
 *
 * The live-price aggregation contract: every supporting provider is
 * fanned out in parallel and the first non-null value per field wins.
 * `SnapshotQuote` is the merged, all-nullable price view; `QuoteFetcher`
 * is the per-provider fetch shape the aggregator runs (adapters stay
 * untouched — thin wrappers in `provider/infrastructure/quote-fetchers/`
 * adapt their existing public methods to this shape; the merge lives in
 * `aggregators/`).
 */
import type { ProviderRateLimitConfig } from 'provider/domain/provider-limiter-config';
import { SNAPSHOT_NUMBERS_TTL_SECONDS } from './snapshot-ttl-policy';

export interface DevWalletQuote {
  readonly wallet: string;
  readonly holdAmount: number | null;
  readonly percentOfSupply: number | null;
  readonly pnlUsd: number | null;
  readonly tag: string | null;
  readonly probable?: boolean;
}

/**
 * Solana-only holder concentration (`rick-compact-card` §10, lane TH).
 *
 * `topPercents` is NON-INCREASING (ties are valid), `0..5` entries:
 * `[]` = silence, `1..5` = render (an object with `[]` is legal, not
 * malformed). `top10Percent` sums the top-10 of the SAME merged/filtered
 * array in the SAME order under the SAME denominator, so
 * `sum(topPercents) <= top10Percent` is exact by construction. Both
 * sides are percentages 0..100 (finite); the consumer applies the
 * display rounding (1dp) and its own ε coherence guard.
 *
 * DISTINCT from the legacy `top10HolderPercent`: that one is per token
 * ACCOUNT (pool vaults included, no exclusions) — a template must never
 * mix both "top 10" metrics on one card.
 */
export interface HolderConcentration {
  readonly topPercents: ReadonlyArray<number>;
  readonly top10Percent: number;
}

export interface SnapshotQuote {
  readonly priceUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  /**
   * Dedicated DexScreener-leg FDV (dexter plan todo 61): the pair-level
   * `fdv` reported by the `dexscreener` fetcher, written ONLY by that
   * leg. The single computed-FDV seam may consume it as a NULL-ONLY
   * fallback (`computedFdvOf(...) ?? sane(this)`), tagged
   * `fdvProvenance: 'dexscreener'`. The generic merged `fdvUsd` NEVER
   * feeds the fallback (Gecko lesson: a reported value with a different
   * supply base must be structurally unable to reach a card).
   */
  readonly dexscreenerFdvUsd: number | null;
  /**
   * Dedicated GeckoTerminal `/info` writer field (dexter plan todo 72):
   * the first non-empty `gt_category_ids` entry carried by the token
   * `/info` payload (e.g. `'pump-fun'`). It is ONLY a candidate origin
   * id — NEVER identity, and NEVER derived from the address suffix,
   * name or symbol — validated later at the snapshot seam via
   * `launchpadInfo`. It is mechanically carried by the generic merge
   * exactly like `dexscreenerFdvUsd`: only the `geckoterminal` fetcher
   * writes it, no other leg ever does.
   */
  readonly geckoLaunchpadHint: string | null;
  readonly liquidityUsd: number | null;
  readonly volume24hUsd: number | null;
  /**
   * Pair-level 1-hour market bucket (dexter `1H` row) — DexScreener
   * `pair.volume.h1`, NOT summed with other buckets. Written by the
   * `dexscreener` fetcher and filled NULL-ONLY from the GeckoTerminal
   * pool pick (`applyVenueMarketFields`) when that leg is the only
   * source; absent/non-finite resolves `null` (never `0`), a real `0`
   * survives.
   */
  readonly volume1hUsd: number | null;
  /**
   * Pair-level 1-hour price change in percent (`pair.priceChange.h1`),
   * written by the `dexscreener` fetcher and filled NULL-ONLY from the
   * GeckoTerminal pool pick (`applyVenueMarketFields`; that leg is
   * BASE-SIDE only, so a pool quoting our mint carries `null`).
   */
  readonly priceChange1h: number | null;
  /**
   * Pair-level 1-hour transaction counts (`pair.txns.h1`), flattened
   * for the merged quote. Written by the `dexscreener` fetcher and
   * filled NULL-ONLY from the GeckoTerminal pool pick
   * (`applyVenueMarketFields`). A WHOLE-PAIR rule: both are `null` when
   * `txns.h1` is absent or either side is not a finite number —
   * absence never becomes `0`.
   */
  readonly txns1hBuys: number | null;
  readonly txns1hSells: number | null;
  readonly priceChange24h: number | null;
  readonly holders: number | null;
  readonly top10HolderPercent: number | null;
  /**
   * Solana holder concentration (`rick-compact-card` §10, lane TH).
   * Written ONLY by the dedicated `solana-holders` fetcher; `null` /
   * absent = silence on every other chain and on every fail-open path
   * (kill-switch, budget timeout, all wallets excluded). Optional so
   * hand-built quote literals stay valid; `emptySnapshotQuote()` sets
   * it explicitly to `null` (the fast path therefore serves silence
   * without touching `degraded` — F8).
   */
  readonly holderConcentration?: HolderConcentration | null;
  readonly symbol: string | null;
  readonly name: string | null;
  readonly lockedLiquidityPercent: number | null;
  readonly burnedPercent: number | null;
  readonly totalSupply: number | null;
  readonly circulatingSupply: number | null;
  readonly maxSupply: number | null;
  readonly devWallets: ReadonlyArray<DevWalletQuote> | null;
  readonly devPctSupply: number | null;
  /**
   * FDV provenance (dexter plan todo 38, extended todo 61):
   * `'computed'` on every quote sealed by the single-seam computed-FDV
   * exit (`buildSnapshot`) — the served/persisted FDV is
   * `price×(total ?? max)`, never a provider-reported number; a
   * computed-null is still `'computed'` (the seam ran). `'dexscreener'`
   * ONLY when the null-only fallback filled the value from the
   * dedicated `dexscreenerFdvUsd` leg field (todo 61) — `'computed'` is
   * never reused for a reported value. `null` only pre-seam (merged but
   * unsealed quotes, pre-todo38 history rows). Deliberately ABSENT
   * from `SNAPSHOT_QUOTE_FIELDS` below: the aggregator merge never
   * copies it from a provider (no fetcher sets it — `Partial` legs
   * simply omit it), so provenance is always assigned, never merged.
   */
  readonly fdvProvenance: 'computed' | 'dexscreener' | null;
  /**
   * Identity provenance (dexter plan todo 39): `'market'` when the
   * served symbol/name came from market legs (providers, discovery
   * pair side), `'metadata'` when they came from the on-chain
   * Metaplex metadata PDA as LAST resort (post-merge, Solana-only —
   * the snapshot seam assigns it, never a fetcher). `null` only when
   * the quote carries no identity at all. Deliberately ABSENT from
   * `SNAPSHOT_QUOTE_FIELDS` below (same rule as `fdvProvenance`):
   * the aggregator merge never copies it, so provenance is always
   * assigned, never merged. Dexter renders `metadata` names with a
   * mandatory `(unverified)` marker — a mutable metadata name is
   * never presented as verified fact (Believe rule).
   */
  readonly identityProvenance: 'market' | 'metadata' | null;
}

export const SNAPSHOT_QUOTE_FIELDS: ReadonlyArray<keyof SnapshotQuote> = [
  'priceUsd',
  'marketCapUsd',
  'fdvUsd',
  'dexscreenerFdvUsd',
  'geckoLaunchpadHint',
  'liquidityUsd',
  'volume24hUsd',
  'volume1hUsd',
  'priceChange1h',
  'txns1hBuys',
  'txns1hSells',
  'priceChange24h',
  'holders',
  'top10HolderPercent',
  'holderConcentration',
  'symbol',
  'name',
  'lockedLiquidityPercent',
  'burnedPercent',
  'totalSupply',
  'circulatingSupply',
  'maxSupply',
  'devWallets',
  'devPctSupply',
];

export function emptySnapshotQuote(): SnapshotQuote {
  return {
    priceUsd: null,
    marketCapUsd: null,
    fdvUsd: null,
    dexscreenerFdvUsd: null,
    geckoLaunchpadHint: null,
    liquidityUsd: null,
    volume24hUsd: null,
    volume1hUsd: null,
    priceChange1h: null,
    txns1hBuys: null,
    txns1hSells: null,
    priceChange24h: null,
    holders: null,
    top10HolderPercent: null,
    holderConcentration: null,
    symbol: null,
    name: null,
    lockedLiquidityPercent: null,
    burnedPercent: null,
    totalSupply: null,
    circulatingSupply: null,
    maxSupply: null,
    devWallets: null,
    devPctSupply: null,
    fdvProvenance: null,
    identityProvenance: null,
  };
}

/**
 * One provider's fetch step. `name` MUST match the provider registry
 * descriptor (so health recording + the `providers` hint list stay
 * consistent); `supportsChains` mirrors the descriptor's chain list.
 *
 * P48-bis seams (all optional, additive): `covers` gates effective
 * coverage before any quota is touched (ccxt: CEX pair symbols only);
 * `endpoint` + `limiterConfig` select the per-endpoint bucket cost.
 */
export interface QuoteFetcher {
  readonly name: string;
  readonly supportsChains: ReadonlyArray<string>;
  readonly covers?: (chain: string, address: string) => boolean;
  readonly endpoint?: string;
  readonly limiterConfig?: ProviderRateLimitConfig;
  fetch(chain: string, address: string): Promise<Partial<SnapshotQuote> | null>;
}

/** DI token for the ordered fetcher list (P48-bis: ccxt first where it covers). */
export const SNAPSHOT_QUOTE_PROVIDERS = 'SNAPSHOT_QUOTE_PROVIDERS';

/** Per-call ceiling for one provider fetch (adapters use 5-8s axios). */
export const SNAPSHOT_PROVIDER_TIMEOUT_MS = 8_000;

/** Hot-result cache TTL in seconds (single source: `snapshot-ttl-policy.ts`, default 30s preserved). */
export const SNAPSHOT_CACHE_TTL_SECONDS = SNAPSHOT_NUMBERS_TTL_SECONDS;

/**
 * Serve-stale max age in hours (dexter plan todo 19b1, SWR floor).
 *
 * A `ready` history row older than this is NOT served stale — the
 * caller gets an honest `pending`/`null` instead of a dead price.
 * Pinned number, not a placeholder: 24h keeps a token's last-known
 * card across a full provider outage day while bounding drift.
 * Override via `SNAPSHOT_STALE_MAX_AGE_HOURS` (non-finite/<=0 values
 * fall back to this default).
 */
export const SNAPSHOT_STALE_MAX_AGE_HOURS = 24;

/** Serve-stale max age in milliseconds (derived from the hours bound). */
export const SNAPSHOT_STALE_MAX_AGE_MS =
  SNAPSHOT_STALE_MAX_AGE_HOURS * 60 * 60 * 1000;

/**
 * Resolve the serve-stale bound from an env string (hours) with the
 * pinned default as fallback. Pure (spec-pinned): unset/blank/
 * non-numeric/<=0 → default.
 */
export function resolveStaleMaxAgeMs(raw: string | undefined): number {
  if (raw === undefined) return SNAPSHOT_STALE_MAX_AGE_MS;
  const hours = Number((raw ?? '').trim());
  if (!Number.isFinite(hours) || hours <= 0) return SNAPSHOT_STALE_MAX_AGE_MS;
  return hours * 60 * 60 * 1000;
}
