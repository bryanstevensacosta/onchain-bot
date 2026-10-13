/**
 * One-time per-pool OHLC seed (dexter plan todo 46, camino al 0% honesto).
 *
 * BINDING ANALYSIS (not re-litigated): an honest `0%` needs a covered
 * 24h window = backfilled history + live price. Candles older than
 * the 6h now-leg bound alone are NOT enough (todo 33 rule intact),
 * and inferred flatness as `0%` is FORBIDDEN (invents semantics).
 *
 * What this module owns (pure, wall-clock via `nowMs` only):
 *
 * - `buildOhlcvSeedRows`: turns fetched Gecko `hour/aggregate=1`
 *   closes into history rows with `createdAt` = CANDLE time (NOT
 *   now). Idempotency falls out of the existing
 *   `unique(key, createdAt)` — the second encounter replays the
 *   same candle timestamps and collides (no new guard table, no
 *   re-fetch for seeding: seeding piggybacks the derivation fetch).
 * - `deriveOutrightVsLiveChange`: the outright-24h vs now-live
 *   math — past anchor (history: backfill + live rows) against the
 *   current merged price.
 *
 * APPROXIMATION (pinned, not hidden): `fdvUsd = close x current
 * supply` via the existing `computedFdvOf` seam — historical supply
 * is taken IDENTICAL to current supply (`total ?? max` as merged
 * this encounter). A later supply change does not rewrite seeded
 * rows; the janitor ages them out on the normal 90d retention.
 *
 * Provenance: seeded rows reuse `quote.fdvProvenance: 'computed'`
 * (NO new provenance value) so `findFdvAth` keeps maxing over ONE
 * semantics (backfill + live).
 *
 * Window: candles within [now - 24h - 2h, now] are seeded (the 24h
 * window plus the past-leg tolerance — everything an anchor read
 * could ever ask for, nothing older). Gaps seed nothing: missing
 * hours simply have no rows (never extrapolated, never partial).
 */

import {
  OHLC_CHANGE_PAST_TOLERANCE_MS,
  OHLC_CHANGE_WINDOW_MS,
  type OhlcvCandle,
} from './snapshot-ohlcv-change';
import { computedFdvOf } from './snapshot-computed-fdv';
import { emptySnapshotQuote, type SnapshotQuote } from './snapshot-quote.types';

/**
 * Source tag for seeded rows: the SAME `geckoterminal-ohlcv` the
 * derived-change leg reports (no new vocabulary — a seeded row IS
 * Gecko OHLC data, only persisted instead of derived).
 */
export const OHLC_BACKFILL_SOURCE = 'geckoterminal-ohlcv';

/** Seed window edge: the 24h window plus the past-leg tolerance. */
export const OHLC_BACKFILL_WINDOW_MS =
  OHLC_CHANGE_WINDOW_MS + OHLC_CHANGE_PAST_TOLERANCE_MS;

/**
 * One seeded history row (repository-shaped, but `kind` stays a
 * plain string — the repository normalizes it to `AddressKind` the
 * same way `toHistoryRow` does, so this module never imports the
 * address domain).
 */
export interface OhlcvSeedRow {
  readonly key: string;
  readonly chain: string;
  readonly address: string;
  readonly kind: string;
  readonly status: 'ready';
  readonly quote: SnapshotQuote;
  readonly sources: ReadonlyArray<string>;
  readonly providerErrors: Record<string, string>;
  readonly createdAt: string;
}

export interface OhlcvSeedContext {
  readonly key: string;
  readonly chain: string;
  readonly address: string;
  readonly kind: string;
  readonly totalSupply: number | null;
  readonly maxSupply: number | null;
}

/**
 * Build seed rows from fetched candles. Skips (never coerces):
 * malformed rows, future candles, candles outside the seed window,
 * non-positive/non-finite closes, and closes failing the seam's own
 * sanity (`< 1e12`, copied vocabulary from `computedFdvOf` — an
 * insane close would poison anchors while the FDV seam nulls it, so
 * the row is dropped, not half-kept). Rows with a null supply still
 * seed (fdv null, price anchor intact — `findFdvAth` skips null-fdv
 * rows, the anchor read only needs the price). Output is ascending
 * by candle time, deduplicated by timestamp (first wins).
 */
export function buildOhlcvSeedRows(
  candles: ReadonlyArray<OhlcvCandle> | null | undefined,
  ctx: OhlcvSeedContext,
  nowMs: number,
): ReadonlyArray<OhlcvSeedRow> {
  if (!Array.isArray(candles) || candles.length === 0) return [];
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return [];
  const nowSec = nowMs / 1000;
  const lowSec = nowSec - OHLC_BACKFILL_WINDOW_MS / 1000;
  const seen = new Set<number>();
  const rows: Array<{ readonly ts: number; readonly row: OhlcvSeedRow }> = [];
  for (const candidate of candles) {
    if (!Array.isArray(candidate)) continue;
    const rowCells: ReadonlyArray<unknown> = candidate;
    const ts = rowCells[0];
    const close = rowCells[4];
    if (
      typeof ts !== 'number' ||
      !Number.isFinite(ts) ||
      typeof close !== 'number' ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    if (ts > nowSec || ts < lowSec) continue;
    if (close <= 0 || close >= 1e12) continue;
    if (seen.has(ts)) continue;
    seen.add(ts);
    // Historical supply IDENTICAL to current supply (approximation
    // pinned by todo 46): the seam's `total ?? max` as merged this
    // encounter, never a provider-reported FDV.
    const fdvUsd = computedFdvOf(close, ctx.totalSupply, ctx.maxSupply);
    rows.push({
      ts,
      row: {
        key: ctx.key,
        chain: ctx.chain,
        address: ctx.address,
        kind: ctx.kind,
        status: 'ready',
        quote: {
          ...emptySnapshotQuote(),
          priceUsd: close,
          fdvUsd,
          fdvProvenance: 'computed',
        },
        sources: [OHLC_BACKFILL_SOURCE],
        providerErrors: {},
        createdAt: new Date(ts * 1000).toISOString(),
      },
    });
  }
  rows.sort((a, b) => a.ts - b.ts);
  return rows.map((entry) => entry.row);
}

/**
 * Outright-24h vs now-live change (percent points, same unit as every
 * native `priceChange24h` and the candle-pure derivation): the past
 * anchor comes from history (backfill + live rows via
 * `findAnchorAt`), the now-leg is the current merged price (strictly
 * fresher than any candle). Null on any gap (no anchor, no live
 * price, non-positive/non-finite legs) — never extrapolated.
 */
export function deriveOutrightVsLiveChange(
  anchorPriceUsd: number | null | undefined,
  livePriceUsd: number | null | undefined,
): number | null {
  if (
    typeof anchorPriceUsd !== 'number' ||
    !Number.isFinite(anchorPriceUsd) ||
    anchorPriceUsd <= 0
  ) {
    return null;
  }
  if (
    typeof livePriceUsd !== 'number' ||
    !Number.isFinite(livePriceUsd) ||
    livePriceUsd <= 0
  ) {
    return null;
  }
  const change = ((livePriceUsd - anchorPriceUsd) / anchorPriceUsd) * 100;
  return Number.isFinite(change) ? change : null;
}
