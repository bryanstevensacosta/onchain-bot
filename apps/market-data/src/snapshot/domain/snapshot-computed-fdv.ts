/**
 * Single-seam computed FDV (dexter plan todo 38).
 *
 * FDV DEFINITION (CoinGecko/Coinbase): `fdv = price × total-supply`.
 * The merge exit (`AddressSnapshotService.buildSnapshot`) is the ONE
 * seam where FDV is decided: provider-reported `fdvUsd` NEVER survives
 * — it is recomputed here from the merged price + supplies, or `null`.
 *
 * GUARD VOCABULARY (copied verbatim, never invented):
 * - price: `isSanePrice` from `direct-fast-path.service.ts:173-177`
 *   (finite, > 0, < 1e12) — a non-sane price poisons every product.
 * - supply: `supplyToNumber` tail (`:1003-1011`) + `marketCapOf`
 *   product guard (`:1013-1024`): finite and > 0, else `null`.
 *   Zero-supply is `null` (not 0): a 0-supply FDV would read as a
 *   measured zero instead of an honest unknown.
 * - `circulating` NEVER feeds FDV (it is the MC input — see below).
 *   `total ?? max`: total wins when present (mint-disabled ⇒
 *   total == max, so fixed-supply tokens agree either way); max is
 *   the EVM-vested fallback (CoinGecko is the only fetcher that
 *   carries max/circ).
 *
 * MC COHERENCE (review finding): when `circulatingSupply` is present,
 * `marketCapUsd = price × circ` is recomputed here too, so no card
 * ever shows MC > FDV unexplained. When `circ` is absent the merged
 * MC is kept as-is — documented assumption (same pattern as
 * `marketCapOf :1017-1019`): mint supply ~= circulating for most SPL
 * mints, so MC ≈ FDV for fixed-supply tokens.
 *
 * PROVENANCE: every row passing this seam is tagged
 * `fdvProvenance: 'computed'`. `findFdvAth` keeps maxing `fdvUsd`
 * over one (now computed) semantics; the 90d history window is
 * MIXED-transient (pre-todo38 provider-reported rows + post computed
 * rows coexist until the janitor prunes the old ones — documented in
 * the repository docstring, not backfilled).
 */

/** Relative epsilon for the FDV invariant (pinned, not a placeholder). */
export const COMPUTED_FDV_EPSILON_REL = 1e-9;

/** Absolute epsilon floor for the FDV invariant (near-zero products). */
export const COMPUTED_FDV_EPSILON_ABS = 1e-9;

/**
 * Invariant bound: `|fdv − price×supply| ≤ max(REL×|price×supply|, ABS)`.
 * Pure (spec-pinned).
 */
export function computedFdvEpsilonBound(product: number): number {
  return Math.max(
    COMPUTED_FDV_EPSILON_REL * Math.abs(product),
    COMPUTED_FDV_EPSILON_ABS,
  );
}

/** `isSanePrice` vocabulary copied from `direct-fast-path.service.ts:173-177`. */
function isSanePrice(value: number | null): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value < 1e12
  );
}

/**
 * Computed FDV from ALREADY-merged quote numbers (fetchers applied
 * `toNumber`, so the seam sees `number | null` — the `typeof` check
 * is the `toNumber` vocabulary tail, not new validation).
 * `circulatingSupply` is deliberately NOT a parameter: it can never
 * feed FDV (spec-asserted at the call site by its absence).
 */
export function computedFdvOf(
  priceUsd: number | null,
  totalSupply: number | null,
  maxSupply: number | null,
): number | null {
  if (!isSanePrice(priceUsd)) return null;
  const supply = totalSupply ?? maxSupply;
  if (typeof supply !== 'number' || !Number.isFinite(supply) || supply <= 0) {
    return null;
  }
  const value = priceUsd * supply;
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Coherent MC from ALREADY-merged quote numbers. Returns `null` when
 * `circulatingSupply` is absent (caller keeps the merged MC — the
 * MC≈FDV-for-fixed-supply assumption above) or unusable; else
 * `price × circ` with the same product guard as FDV.
 */
export function coherentMarketCapOf(
  priceUsd: number | null,
  circulatingSupply: number | null,
): number | null {
  if (!isSanePrice(priceUsd)) return null;
  if (
    typeof circulatingSupply !== 'number' ||
    !Number.isFinite(circulatingSupply) ||
    circulatingSupply <= 0
  ) {
    return null;
  }
  const value = priceUsd * circulatingSupply;
  return Number.isFinite(value) && value > 0 ? value : null;
}

export interface ComputedFdvPatch {
  readonly fdvUsd: number | null;
  readonly marketCapUsd: number | null;
  /** Always `'computed'`: the seam ran (even a computed-null is computed). */
  readonly fdvProvenance: 'computed';
  /** True iff `marketCapUsd` above is `price×circ` (not the merged MC). */
  readonly marketCapRecomputed: boolean;
}

/**
 * The seam patch: FDV recomputed (`total ?? max`), MC recomputed iff
 * `circ` present (else the merged MC is returned untouched), provenance
 * tagged. `reportedFdvUsd`/`reportedMarketCapUsd` are returned for the
 * caller's debug-log of discarded provider-reporteds (log-only, never
 * served).
 */
export function applyComputedFdv(quote: {
  readonly priceUsd: number | null;
  readonly marketCapUsd: number | null;
  readonly fdvUsd: number | null;
  readonly totalSupply: number | null;
  readonly circulatingSupply: number | null;
  readonly maxSupply: number | null;
}): ComputedFdvPatch & {
  readonly reportedFdvUsd: number | null;
  readonly reportedMarketCapUsd: number | null;
} {
  const fdvUsd = computedFdvOf(
    quote.priceUsd,
    quote.totalSupply,
    quote.maxSupply,
  );
  const hasCirc =
    quote.circulatingSupply !== null && quote.circulatingSupply !== undefined;
  const recomputedMc = hasCirc
    ? coherentMarketCapOf(quote.priceUsd, quote.circulatingSupply)
    : null;
  return {
    fdvUsd,
    marketCapUsd: recomputedMc ?? quote.marketCapUsd,
    fdvProvenance: 'computed',
    marketCapRecomputed: recomputedMc !== null,
    reportedFdvUsd: quote.fdvUsd,
    reportedMarketCapUsd: quote.marketCapUsd,
  };
}

/** Provenance tag for new history rows (dexter plan todo 38). */
export type FdvProvenance = 'computed';

export function isComputedFdvProvenance(
  value: unknown,
): value is FdvProvenance {
  return value === 'computed';
}
