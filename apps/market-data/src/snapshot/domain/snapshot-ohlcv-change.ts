/**
 * OHLC-derived 24h change (dexter plan todo 33, fallback leg).
 *
 * When NO native `priceChange24h` survives the fan-out merge
 * (DexScreener/Birdeye/CoinGecko/Moralis all null — e.g. Gecko-only
 * tokens like STAGEVEIL whose `/info` carries no change field), the
 * snapshot derives the figure from the pool's OHLC candles instead:
 *
 *   change% = (close-now - close-24h-ago) / close-24h-ago * 100
 *
 * (percent points, same unit as every native `priceChange24h`).
 *
 * Window rule (pinned numbers, not placeholders):
 *
 * - NOW leg: the newest candle at or before request time must be at
 *   most `OHLC_CHANGE_NOW_FRESHNESS_MS` (6h) old. Hourly `aggregate=1`
 *   candles on quiet pools are sparse (trade-gated: no trade, no
 *   candle), so a few missed hours are tolerated — but a days-old
 *   close is NOT a "now" price, and deriving a 24h figure from it
 *   would fabricate movement. Stale now-leg -> null.
 * - PAST leg: the candle nearest to exactly-24h-before-now must land
 *   within `OHLC_CHANGE_PAST_TOLERANCE_MS` (2h). Gaps wider than that
 *   mean the window has no anchor -> honest null, NEVER extrapolated
 *   (no interpolation across missing candles, no partial-window math).
 *
 * Both bounds are documented in market-data AGENTS (todo 33 entry).
 * Pure function below: wall-clock enters ONLY via `nowMs`, so specs
 * pin real OHLC fixtures against pinned timestamps (no flakiness).
 */

/** Exact 24h window (milliseconds). */
export const OHLC_CHANGE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Past-leg tolerance: how far the anchor candle may sit from the
 * exact 24h-ago mark. 2h keeps the window exact-ish on hourly
 * candles while tolerating a couple of trade-quiet hours.
 */
export const OHLC_CHANGE_PAST_TOLERANCE_MS = 2 * 60 * 60 * 1000;

/**
 * Now-leg freshness: the newest usable candle must be this recent.
 * 6h tolerates sparse-but-alive pools; anything older means the
 * pool has no meaningful "current" price for a 24h figure.
 */
export const OHLC_CHANGE_NOW_FRESHNESS_MS = 6 * 60 * 60 * 1000;

/**
 * One GeckoTerminal OHLCV row, verbatim upstream order:
 * `[timestamp, open, high, low, close, volume]` — timestamp is epoch
 * SECONDS (Gecko FAQ), closes are USD strings parsed to numbers by
 * the adapter (`getPoolOhlcv` validates finiteness; only `[0]` and
 * `[4]` are read here).
 */
export type OhlcvCandle = readonly [
  timestampSec: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
];

/**
 * Derive the 24h change percent from OHLC candles, or null when the
 * window has no honest anchor (empty input, stale now-leg, missing
 * past-leg, non-positive past close, non-finite math). Never throws
 * on garbage input — malformed rows are skipped, never coerced.
 */
export function deriveChange24hFromOhlcv(
  candles: ReadonlyArray<OhlcvCandle> | null | undefined,
  nowMs: number,
): number | null {
  if (!Array.isArray(candles) || candles.length === 0) return null;
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return null;
  const nowSec = nowMs / 1000;

  let nowClose: number | null = null;
  let nowTs = Number.NEGATIVE_INFINITY;
  for (const candidate of candles) {
    // Array.isArray narrows tuples to any[] — re-anchor as unknown
    // cells so the typeof guards below do the real validation.
    if (!Array.isArray(candidate)) continue;
    const row: ReadonlyArray<unknown> = candidate;
    const ts = row[0];
    const close = row[4];
    if (
      typeof ts !== 'number' ||
      !Number.isFinite(ts) ||
      typeof close !== 'number' ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    // Future candles (clock skew / upstream lag) are never "now".
    if (ts > nowSec) continue;
    if (ts > nowTs) {
      nowTs = ts;
      nowClose = close;
    }
  }
  if (nowClose === null) return null;
  if (nowSec - nowTs > OHLC_CHANGE_NOW_FRESHNESS_MS / 1000) return null;

  const target = nowSec - OHLC_CHANGE_WINDOW_MS / 1000;
  const toleranceSec = OHLC_CHANGE_PAST_TOLERANCE_MS / 1000;
  let pastClose: number | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  let bestTs = Number.NEGATIVE_INFINITY;
  for (const candidate of candles) {
    if (!Array.isArray(candidate)) continue;
    const row: ReadonlyArray<unknown> = candidate;
    const ts = row[0];
    const close = row[4];
    if (
      typeof ts !== 'number' ||
      !Number.isFinite(ts) ||
      typeof close !== 'number' ||
      !Number.isFinite(close)
    ) {
      continue;
    }
    if (ts > nowSec) continue;
    const diff = Math.abs(ts - target);
    if (diff > toleranceSec) continue;
    // Nearest wins; exact ties break toward the newer candle
    // (deterministic — spec-pinned).
    if (diff < bestDiff || (diff === bestDiff && ts > bestTs)) {
      bestDiff = diff;
      bestTs = ts;
      pastClose = close;
    }
  }
  if (pastClose === null || pastClose <= 0) return null;
  const change = ((nowClose - pastClose) / pastClose) * 100;
  return Number.isFinite(change) ? change : null;
}
