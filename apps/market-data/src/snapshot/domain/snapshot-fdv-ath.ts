/**
 * Snapshot FDV ATH domain type (dexter fdv-ath, plan todo 16).
 *
 * The all-time-high FDV of a token over its OWN persisted snapshot
 * history: `{ fdvUsd, at }` (max FDV + the ISO timestamp of the row
 * that set it) or `null` when no history row carries a usable FDV
 * (cold-start). Resolved live per call, never persisted — same
 * lifecycle as `launchpad`/`venue`.
 *
 * RETENTION LIMIT (janitor window): the history behind this max is
 * pruned by `SnapshotHistoryJanitorService` to the last
 * `SNAPSHOT_HISTORY_RETENTION_DAYS` (90) days — ATH is the max over
 * the surviving window, NOT over all time. Cold-start honesty: the
 * in-flight snapshot's own FDV is NEVER substituted (read happens
 * BEFORE the current row is persisted, so a first-seen token always
 * resolves `null`).
 *
 * ONE-SEMANTICS NOTE (dexter plan todo 38): post-seam rows are all
 * `fdvProvenance: 'computed'` (`price×(total ?? max)`), so the max
 * is over one semantics going forward; the 90d window is
 * mixed-transient (pre-seam provider-reported rows age out via the
 * janitor, no backfill).
 *
 * FALLBACK NOTE (dexter plan todo 61, max-all kept deliberately): the
 * null-only DexScreener fallback (`fdvProvenance: 'dexscreener'`) also
 * feeds this max with NO query change — rows exist here regardless of
 * provenance. Filtering to `'computed'` would leave tokens whose FDV
 * is only ever fallback-filled WITHOUT any `fdvAth` forever
 * (cold-start-honest but UX-dead), and the two semantics measurably
 * agree (DSC pair fdv ≈ `price × on-chain supply`; SCRIP live
 * 2653 vs 2652.34, WENCAT same-minute delta ~0.1% — DSC's integer
 * rounding is the residual). Mixed-semantics is therefore accepted
 * and documented, not hidden.
 *
 * ADJUSTMENT NOTE (dexter plan todo 68, oracle review absorbed): the
 * same read-before-save rule resolves the historical one-shot ATH seed
 * (`geckoterminal-ath-seed`, day `max(high) × supply`) BEFORE the
 * current row persists — so a first sight can serve the seeded history
 * immediately, while the in-flight FDV still never becomes an ATH
 * input. The ONE documented exception is the CLAMP below in
 * `buildSnapshot`: when history already carries an ATH and the current
 * in-flight FDV exceeds it, the served (never persisted) ATH is
 * clamped UP to the current FDV at `now` — a new ATH being observed
 * live. The clamp never invents an ATH from null (cold-start honesty
 * intact) and never lowers an existing max (max-only).
 */
export interface SnapshotFdvAth {
  readonly fdvUsd: number;
  readonly at: string;
}

/**
 * `findFdvAth` result (dexter plan todo 68): the max + its timestamp,
 * AND whether any row of this token carries the one-shot ATH seed
 * marker (`geckoterminal-ath-seed`). The service's seed guard is
 * "marker absent -> attempt once" — it covers cold tokens AND tokens
 * that already have live history (exactly one day-series attempt per
 * token, per the owner decision 2026-10-18).
 */
export interface FdvAthLookup {
  readonly ath: SnapshotFdvAth | null;
  readonly seeded: boolean;
}

export function toFdvAthOrNull(raw: unknown): SnapshotFdvAth | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  const { fdvUsd, at } = candidate;
  if (typeof fdvUsd !== 'number' || !Number.isFinite(fdvUsd)) return null;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  return { fdvUsd, at };
}
