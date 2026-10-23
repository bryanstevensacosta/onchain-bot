/**
 * One-shot historical FDV-ATH seed (dexter plan todo 68; research todo
 * 67 GT-viable keyless; oracle review ADJUST absorbed 2026-10-18).
 *
 * WHAT THIS OWNS (pure, wall-clock via `nowMs` only):
 *
 * - `buildFdvAthSeedRow`: turns ONE `ohlcv/day` GeckoTerminal series
 *   into the single history row that seeds `fdvAth` on a token's first
 *   sight (cold OR pre-existing - the caller's guard is "no
 *   `geckoterminal-ath-seed` marker row yet -> attempt once").
 * - The negative memo (`AthSeedNegativeMemo`): in-process,
 *   bounded-capacity, pinned-TTL memory of DEFINITIVE absences so a
 *   token whose day series answers `[]`/404/401 is not re-fetched on
 *   every snapshot. Transient failures (429/5xx/timeout) are NEVER
 *   memoized - they retry on the next request.
 *
 * SEMANTICS (pinned by todo 68, supersedes the max(close) draft):
 * `fdvAth = max(high over day candles) x supply-of-our-leg`
 * (`totalSupply ?? maxSupply` as merged THIS encounter - same
 * approximation vocabulary as `snapshot-ohlcv-backfill.ts`), `fdvAthAt`
 * = the peak candle's open + 1ms (see STAMPING). `max(close)` was
 * rejected: it underestimates CHALE by -64% with a false 30d age (live
 * evidence `.omo/evidence/task-fe-ath-backfill-ext.log` [4]); `high`
 * overshoots the Rick reference by +8%..+43% on the two measured
 * samples - the SAME sign as Rick's documented anti-spike filter (his
 * card text: "aims for realistic ATHs rather than short-lived spikes").
 * The wick caveat is documented, not hidden: a thin-wick day can seed a
 * high no later trade re-visited. True-session-max is our OWN
 * `fdvAth` semantics (max over own persisted samples) extended into
 * history - never a claim of Rick parity.
 *
 * WINDOW (pinned): candles within the retention window
 * (`SNAPSHOT_ATH_SEED_DAYS`, default 90 = janitor retention) are
 * eligible; the public keyless GT window is 180d but the janitor prunes
 * past 90d, so an older peak would seed a row that gets pruned out of
 * `findFdvAth`'s read - older peaks are SKIPPED (honest: no seed rows
 * outside the surviving window). ONE call `ohlcv/day?limit=100` covers
 * the whole 100-day span (>= 90d retention) - the caller ladders that
 * call with its own ~2s `withTailBudget`, so the card never waits.
 *
 * STAMPING (collision rule, pinned): the seeded row's `createdAt` is
 * the peak candle's OPEN time + 1ms, NOT `now`:
 * - the peak timestamp IS the ATH age (`findFdvAth` reports the setting
 *   row's `createdAt` as `at`), so candle time is the honest stamp;
 * - day candles open at exactly 00:00:00.000 UTC; the todo-46 hourly
 *   backfill stamps rows at exact candle times too, so a midnight
 *   overlap would collide on `unique(key, createdAt)` and SKIP the day
 *   row (`saveSeeded` answers null). +1ms keeps the day row distinct
 *   from an hourly row at the same midnight (spec-pinned).
 *
 * ROW SHAPE: `status: 'ready'`, provenance `'computed'` (the same
 * `computedFdvOf` seam as every post-todo-38 row - `priceUsd` is the
 * peak HIGH and `fdvUsd` its product with supply, so the row satisfies
 * the one-semantics invariant), and `sources: [ATH_SEED_SOURCE]` (the
 * `'geckoterminal-ath-seed'` marker `findFdvAth` exposes, and the
 * service guard "no marker -> attempt"). The row IS Gecko day data,
 * tagged by its own provenance cohort so SWR/anchor reads treat it like
 * any coherent ready sample (see the repository/AGENTS notes).
 *
 * KILL-SWITCH: `SNAPSHOT_ATH_SEED_ENABLED` (default ENABLED) and
 * `SNAPSHOT_ATH_SEED_DAYS` (default 90) - resolved once at service
 * construction, same precedent as `SNAPSHOT_STALE_MAX_AGE_HOURS`.
 */

import { computedFdvOf } from './snapshot-computed-fdv';
import type { OhlcvCandle } from './snapshot-ohlcv-change';
import type { OhlcvSeedRow } from './snapshot-ohlcv-backfill';
import { emptySnapshotQuote } from './snapshot-quote.types';

/**
 * Source tag of the one-shot ATH seed row. This IS the anti-masking
 * marker (todo 68): `findFdvAth` reports whether any row of the token
 * carries it, and the service attempts the seed only when it does not.
 */
export const ATH_SEED_SOURCE = 'geckoterminal-ath-seed';

/** Eligible window in days (default = janitor retention, todo 68). */
export const SNAPSHOT_ATH_SEED_DAYS_DEFAULT = 90;

/** Hard ceiling for the env override (GT public window is 180d). */
export const SNAPSHOT_ATH_SEED_DAYS_MAX = 180;

/** One `ohlcv/day` call ceiling (100 day rows >= 90d retention). */
export const SNAPSHOT_ATH_SEED_LIMIT = 100;

/**
 * Seed-attempt budget (caller-side `withTailBudget`): the card never
 * waits more than this on a first sight, and the adapter's own axios
 * timeout carries the same pinned number (`getPoolOhlcvDay`).
 */
export const SNAPSHOT_ATH_SEED_TIMEOUT_MS = 2_000;

/**
 * Negative-memo TTL (pinned decision, todo 68): DEFINITIVE absences
 * (`[]`/404/401 - the GT method answered null) suppress re-fires for 6h.
 * Rationale: the seed is one-shot per token and a fresh pool can answer
 * `[]` legitimately while its first trades are minutes away - 6h bounds
 * re-fires to <= 4/day/token (deploy restarts clear the map) while
 * still letting a late-live pool seed the same day. 429/5xx/timeouts
 * are NEVER memoized (they retry next request; GT's own throttle is the
 * ceiling).
 */
export const SNAPSHOT_ATH_SEED_NEGATIVE_TTL_MS = 6 * 60 * 60 * 1000;

/** Bounded negative-memo capacity (same 500 precedent as the history ring). */
export const SNAPSHOT_ATH_SEED_MEMO_MAX = 500;

/**
 * Short-lived 429 backoff (plan todo 72, P1): a THROTTLED seed attempt
 * is transient, but re-firing it on EVERY snapshot during a Gecko wall
 * wastes the one free quota unit the card has. 60s is the pinned pause
 * (one attempt/minute/token) — distinct from the 6h DEFINITIVE memo
 * above, which is about absence, not pressure.
 */
export const SNAPSHOT_ATH_SEED_TRANSIENT_BACKOFF_MS = 60_000;

/** Midnight-collision offset: day row stamped at candle open + 1ms. */
export const ATH_SEED_TS_OFFSET_MS = 1;

/** `isSanePrice` vocabulary (copied from `snapshot-computed-fdv.ts`). */
function isSaneHigh(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value < 1e12
  );
}

/**
 * Kill-switch (todo 68): default ENABLED; only an explicit
 * false-ish token disables (`SNAPSHOT_ATH_SEED_ENABLED=0|false|off|no`).
 * Unset/blank/anything else keeps the seed on - the seed is additive,
 * fail-open and budget-bounded, so "on" is the safe default.
 */
export function resolveAthSeedEnabled(raw: string | undefined): boolean {
  if (typeof raw !== 'string') return true;
  const value = raw.trim().toLowerCase();
  if (value === '') return true;
  return !['0', 'false', 'off', 'no', 'disabled'].includes(value);
}

/**
 * Window resolver (todo 68): positive integer days, capped at
 * `SNAPSHOT_ATH_SEED_DAYS_MAX`; unset/blank/non-numeric/<=0 -> default
 * 90 (the janitor retention - the pinned number, not a placeholder).
 */
export function resolveAthSeedDays(raw: string | undefined): number {
  if (typeof raw !== 'string') return SNAPSHOT_ATH_SEED_DAYS_DEFAULT;
  const days = Number(raw.trim());
  if (!Number.isFinite(days) || days <= 0)
    return SNAPSHOT_ATH_SEED_DAYS_DEFAULT;
  return Math.min(Math.floor(days), SNAPSHOT_ATH_SEED_DAYS_MAX);
}

export interface AthSeedContext {
  readonly key: string;
  readonly chain: string;
  readonly address: string;
  readonly kind: string;
  readonly totalSupply: number | null;
  readonly maxSupply: number | null;
  /** Eligible window (days) - the caller passes the resolved kill-switch value. */
  readonly windowDays: number;
  /**
   * Merged pair creation (ms epoch; `null`/absent = unknown). Day
   * candles bucket at 00:00Z, so a pool created at 18:08:53Z on its
   * launch day would otherwise get an ATH row dated BEFORE the pool
   * existed (9d shown where the real age is 8d). The builder clamps
   * the stamp to this value when it is sane and inside the window -
   * the ATH can never predate the pool.
   */
  readonly poolCreatedAtMs?: number | null;
}

/**
 * Build THE one seed row (the peak candle) or `null` when nothing is
 * seedable. Skips (never coerces): malformed rows, insanely high or
 * non-finite highs, future candles, candles outside the retention
 * window, and a supply that cannot produce a sane computed FDV. Peak
 * ties break toward the NEWER candle (GT answers newest-first; the
 * first max encountered with the strict `>` comparison is the newest).
 */
export function buildFdvAthSeedRow(
  candles: ReadonlyArray<OhlcvCandle> | null | undefined,
  ctx: AthSeedContext,
  nowMs: number,
): OhlcvSeedRow | null {
  if (!Array.isArray(candles) || candles.length === 0) return null;
  if (typeof nowMs !== 'number' || !Number.isFinite(nowMs)) return null;
  const supply = ctx.totalSupply ?? ctx.maxSupply;
  if (typeof supply !== 'number' || !Number.isFinite(supply) || supply <= 0) {
    return null;
  }
  const windowDays =
    Number.isFinite(ctx.windowDays) && ctx.windowDays > 0
      ? ctx.windowDays
      : SNAPSHOT_ATH_SEED_DAYS_DEFAULT;
  const nowSec = nowMs / 1000;
  const lowSec = nowSec - windowDays * 24 * 60 * 60;
  let bestTs: number | null = null;
  let bestHigh: number | null = null;
  for (const candidate of candles) {
    if (!Array.isArray(candidate)) continue;
    const cells: ReadonlyArray<unknown> = candidate;
    const ts = cells[0];
    const high = cells[2];
    if (typeof ts !== 'number' || !Number.isFinite(ts)) continue;
    if (!isSaneHigh(high)) continue;
    // ts <= now and inside the retention window (todo 68 guards).
    if (ts > nowSec || ts < lowSec) continue;
    // Strict `>`: ties keep the FIRST (newest-first input) candle.
    if (bestHigh === null || high > bestHigh) {
      bestTs = ts;
      bestHigh = high;
    }
  }
  if (bestTs === null || bestHigh === null) return null;
  const fdvUsd = computedFdvOf(bestHigh, ctx.totalSupply, ctx.maxSupply);
  if (fdvUsd === null) return null;
  // Pool-creation clamp: the peak candle's bucket may predate the pool
  // (launch-day 00:00Z bucket vs an 18:08:53Z creation), which would
  // make the ATH look older than the token. A sane in-window creation
  // time is the anchor; a future/invalid one is IGNORED (never move
  // the ATH into the future). `bestTs * 1000` stays the base.
  const candleMs = bestTs * 1000;
  const poolCreatedAtMs = ctx.poolCreatedAtMs;
  const anchorMs =
    typeof poolCreatedAtMs === 'number' &&
    Number.isFinite(poolCreatedAtMs) &&
    poolCreatedAtMs <= nowMs &&
    poolCreatedAtMs > candleMs
      ? poolCreatedAtMs
      : candleMs;
  return {
    key: ctx.key,
    chain: ctx.chain,
    address: ctx.address,
    kind: ctx.kind,
    status: 'ready',
    quote: {
      ...emptySnapshotQuote(),
      priceUsd: bestHigh,
      fdvUsd,
      fdvProvenance: 'computed',
    },
    sources: [ATH_SEED_SOURCE],
    providerErrors: {},
    // Open + 1ms (clamped to pool creation when the bucket predates it):
    // keeps the ATH age at the candle that set the peak while staying
    // distinct from an exact-midnight hourly row.
    createdAt: new Date(anchorMs + ATH_SEED_TS_OFFSET_MS).toISOString(),
  };
}

/**
 * Bounded in-process negative memo (todo 68). `has(key, now)` also
 * lazily evicts the expired entry; `remember` refreshes the insertion
 * order (true FIFO on the capacity cap) and never grows past
 * `maxEntries`. Deliberately NOT a cache of anything but "definitive
 * absence" - transient classes are excluded by the caller.
 */
export class AthSeedNegativeMemo {
  private readonly entries = new Map<string, number>();

  public constructor(
    private readonly ttlMs: number = SNAPSHOT_ATH_SEED_NEGATIVE_TTL_MS,
    private readonly maxEntries: number = SNAPSHOT_ATH_SEED_MEMO_MAX,
  ) {}

  public has(key: string, nowMs: number): boolean {
    const expiresAt = this.entries.get(key);
    if (expiresAt === undefined) return false;
    if (expiresAt <= nowMs) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  public remember(key: string, nowMs: number): void {
    this.entries.delete(key);
    this.entries.set(key, nowMs + this.ttlMs);
    while (this.entries.size > Math.max(1, this.maxEntries)) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }
}

/**
 * 429 backoff memo (plan todo 72, P1) — the transient sister of
 * `AthSeedNegativeMemo`. Same bounded/FIFO mechanics, different meaning:
 * an entry here says "this token's ATH seed was THROTTLED a moment ago,
 * skip the next attempts for 60s", NOT "the series does not exist".
 *
 * Why it is separate (do NOT merge the two):
 * - the definitive memo is a 6h statement about ABSENCE (404/401/400/
 *   empty series) — a throttle must never poison it;
 * - this memo is a 60s statement about PRESSURE — it must expire fast
 *   so a late-live pool still seeds the same day.
 * Only `rate-limited` transients are recorded: timeouts and 5xx keep the
 * pre-72 behavior (fail-open, retry next request) because they carry no
 * throttle signal.
 */
export class AthSeedTransientBackoff extends AthSeedNegativeMemo {
  public constructor(
    ttlMs: number = SNAPSHOT_ATH_SEED_TRANSIENT_BACKOFF_MS,
    maxEntries: number = SNAPSHOT_ATH_SEED_MEMO_MAX,
  ) {
    super(ttlMs, maxEntries);
  }
}
