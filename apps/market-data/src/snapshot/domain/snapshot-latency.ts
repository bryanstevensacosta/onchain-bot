/**
 * Snapshot latency budget (dexter plan todo 21 — "Paquete latencia
 * <1s estilo Rick: SWR-now + existence-check + race-deadlines +
 * aging"). Pure resolvers + note builders only; every consumer reads
 * its value ONCE at construction (same pattern as `staleMaxAgeMs`).
 *
 * The four pieces and their pinned numbers:
 *
 * 1. SWR-now: a warm `ready` history row serves WITHOUT waiting for
 *    the fan-out (async background refresh, deduped via singleflight
 *    under a separate `refresh:<cacheKey>` key). The window lower
 *    bound is `SNAPSHOT_SWR_MIN_AGE_MS` (the 30s numbers TTL): rows
 *    younger than one cache window keep pure pipeline semantics (the
 *    service cache covers that range in prod; DI harnesses without a
 *    cache stay deterministic). Upper bound reuses the existing
 *    `staleMaxAgeMs` (24h) — wider would serve rows the stale floor
 *    would have rejected.
 *
 * 2. Existence-check: EVM `eth_getCode` (empty on `token` kind ->
 *    missing; on `unknown` kind a zero `eth_getTransactionCount`
 *    confirms) / Solana `getAccountInfo` account probe BEFORE the
 *    fan-out. Definitively-dead addresses short-circuit to an
 *    `invalid` card — fast, differentiated, no provider burn. Fail-
 *    open `unresolved` otherwise (deadline or transport gap).
 *
 * 3. Race deadlines (fail-open, never throw): the aggregator abandons
 *    stragglers at `SNAPSHOT_FANOUT_DEADLINE_MS` (rejected records,
 *    named in `providerErrors`); the existence probe owns
 *    `SNAPSHOT_EXISTENCE_DEADLINE_MS` (timer -> `unresolved`).
 *
 * 4. Pending aging: consecutive-pending counter per (chain, address,
 *    kind) — `SNAPSHOT_PENDING_AGING_N` consecutive pendings within
 *    `SNAPSHOT_PENDING_AGING_WINDOW_MS` escalate the card to
 *    `invalid` (differentiated from a transient pending; entry KEPT so
 *    it re-escalates until fresh data clears it).
 */
import { SNAPSHOT_NUMBERS_TTL_SECONDS } from './snapshot-ttl-policy';

/**
 * SWR-now minimum row age in ms (ONE numbers-TTL window). A `ready`
 * row younger than this keeps pure pipeline semantics: in production
 * the 30s service/edge cache already covers that range (a request
 * reaching the pipeline for such a row is a cache miss, and serving
 * the ≤30s-old row as "stale-while-revalidate" would misreport a
 * fresh card); in DI harnesses without a CacheModule it also keeps
 * every immediate-repeat pin deterministic.
 */
export const SNAPSHOT_SWR_MIN_AGE_MS = SNAPSHOT_NUMBERS_TTL_SECONDS * 1000;

/**
 * Fan-out race deadline in ms (default 4000). Once elapsed, the
 * aggregator records unfinished fetchers as abandoned (fail-open
 * rejected records) so a straggler never blocks the serve. The
 * per-fetcher timeout (8s) still bounds each call; this bounds the
 * WHOLE fan-out.
 */
export const SNAPSHOT_FANOUT_DEADLINE_MS_DEFAULT = 4_000;

/**
 * Existence-probe deadline in ms (default 800). The probe races this
 * timer; on expiry the verdict is `unresolved` (fail-open — the
 * snapshot proceeds exactly as if no probe existed).
 */
export const SNAPSHOT_EXISTENCE_DEADLINE_MS_DEFAULT = 800;

/** Consecutive-pending escalations before aging turns the card `invalid` (default 3). */
export const SNAPSHOT_PENDING_AGING_N_DEFAULT = 3;

/** Aging window in ms (default 10 min): a gap wider than this restarts the streak. */
export const SNAPSHOT_PENDING_AGING_WINDOW_MS_DEFAULT = 600_000;

/** Read-once resolver: positive finite number or the pinned default. */
function resolvePositiveMs(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number((raw ?? '').trim());
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function resolveFanoutDeadlineMs(raw: string | undefined): number {
  return resolvePositiveMs(raw, SNAPSHOT_FANOUT_DEADLINE_MS_DEFAULT);
}

export function resolveExistenceDeadlineMs(raw: string | undefined): number {
  return resolvePositiveMs(raw, SNAPSHOT_EXISTENCE_DEADLINE_MS_DEFAULT);
}

export function resolvePendingAgingN(raw: string | undefined): number {
  return resolvePositiveMs(raw, SNAPSHOT_PENDING_AGING_N_DEFAULT);
}

export function resolvePendingAgingWindowMs(raw: string | undefined): number {
  return resolvePositiveMs(raw, SNAPSHOT_PENDING_AGING_WINDOW_MS_DEFAULT);
}

/**
 * SWR-now audit note (`providerErrors['swr-now']`). Wording is
 * deliberately clean of the governor quota-trigger pattern
 * (`/429|retry-after|budget exceeded|rate.?limit|quota|too many/i`) —
 * a latency serve must never count as quota pressure. Spec-pinned.
 */
export function swrNowNote(ageMs: number): string {
  const age = Math.max(0, Math.round(ageMs));
  return `served warm history row (age ${age}ms) while refreshing in background — latency serve, fail-open`;
}

/**
 * Aging-escalation audit note (`providerErrors.aging`). Also clean of
 * the governor trigger pattern (spec-pinned).
 */
export function agingEscalationNote(count: number, windowMs: number): string {
  const windowSec = Math.max(0, Math.round(windowMs / 1000));
  return `pending ${count} consecutive times within ${windowSec}s — escalated to invalid (aging, resets on deploy)`;
}
