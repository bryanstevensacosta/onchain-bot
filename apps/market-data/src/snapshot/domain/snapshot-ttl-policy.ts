/**
 * Snapshot TTL policy (dexter plan todo 41 — the SINGLE source of
 * truth for every cache TTL a snapshot writer uses).
 *
 * BEFORE this file the 30s default lived in FOUR independent literals
 * (`SNAPSHOT_CACHE_TTL_SECONDS`, `GATEWAY_BATCH_TTL_SECONDS`,
 * `CacheInterceptor` default, `@CacheTTL(30)` on the snapshot edges) —
 * any one of them could drift silently. Now every snapshot writer
 * derives from `SNAPSHOT_NUMBERS_TTL_SECONDS` below, and
 * `snapshot-ttl-policy.spec.ts` FAILS if a snapshot writer hardcodes a
 * TTL literal again (source-text assertion, not just a value pin).
 *
 * PER-CLASS RULES (pinned by the todo):
 * - numbers (30s, TTL-cached): price/mcap/fdv/liq/vol/change/holders/
 *   supply/dev — move in seconds, ride the hot snapshot + edge caches.
 * - identity (history-bound, NO TTL writer): symbol/name live in
 *   history rows (90d janitor window); there is no identity-only cache
 *   to TTL, so no hours-class exists to misconfigure.
 * - venue/launchpad (live-per-call + 30d discovery cache, NO
 *   mint-immutability claim): venue/launchpad resolve live on EVERY
 *   request (even stale replays — see below); the only persisted
 *   discovery is the 30d tripwire-verified discovery cache, invalidated
 *   by tripwire mismatch + on-chain migration signal + operator
 *   override (existing seams, not a new "immutable by mint" rule).
 * - holders/dev (TTL-short-justified, NO hours-class): resolved live
 *   per call under the 400ms tail budget, cached ONLY as part of the
 *   30s snapshot card. Rug/dev-dump moves in minutes and NO signal
 *   trigger exists that could invalidate an hours-long cache — so no
 *   hours-class is offered (a trigger-less long TTL would serve dead
 *   safety data as live).
 *
 * STALE-TRIO PER CLASS (one trio, class-scoped semantics — no new
 * bits): when the fan-out fails and a ready row replays, ONLY the
 * replayed classes are stale (numbers + identity + dev, age =
 * `staleAgeMs`); venue/launchpad/fdvAth on the SAME card are resolved
 * live for that request and stay fresh. The badge shows the numbers
 * age; the AGENTS section pins which classes it covers.
 *
 * PENDING IS NEVER CACHED (19a absolute — the reverted "≤5s" idea is
 * NOT revived here): no pending-TTL exists in this policy on purpose.
 */

export type SnapshotTtlClass =
  | 'numbers'
  | 'identity'
  | 'venue-launchpad'
  | 'holders-dev';

export interface SnapshotTtlRule {
  /** Seconds, or `null` when the class is NOT TTL-cached (bound by history/invalidation/live instead). */
  readonly ttlSeconds: number | null;
  /** One-line semantics: what the value means and what bounds it instead when `null`. */
  readonly semantics: string;
  /** Where the served age comes from for this class (`staleAgeMs` only on replays). */
  readonly ageSource: string;
}

/**
 * Hot-numbers TTL in seconds (prices move in seconds). THE number
 * every snapshot cache writer uses — default 30s preserved
 * (edge + service + batch + interceptor were all 30s before).
 */
export const SNAPSHOT_NUMBERS_TTL_SECONDS = 30;

/** Edge-cache TTL for snapshot GET surfaces (same 30s — one knob, not two). */
export const SNAPSHOT_EDGE_TTL_SECONDS = SNAPSHOT_NUMBERS_TTL_SECONDS;

export const SNAPSHOT_TTL_POLICY: Record<SnapshotTtlClass, SnapshotTtlRule> = {
  numbers: {
    ttlSeconds: SNAPSHOT_NUMBERS_TTL_SECONDS,
    semantics:
      'hot snapshot + edge caches (30s); a MISS fans out, a HIT costs zero quota',
    ageSource:
      'fresh at serve time; staleAgeMs on history replays (<=24h bound)',
  },
  identity: {
    ttlSeconds: null,
    semantics:
      'history-bound (90d janitor window), no identity-only cache writer exists',
    ageSource:
      'replayed row age (staleAgeMs) when the card is a replay, else fresh',
  },
  'venue-launchpad': {
    ttlSeconds: null,
    semantics:
      'live-per-call + 30d tripwire-verified discovery cache; invalidated by ' +
      'tripwire mismatch / on-chain migration signal / operator override — never "immutable by mint"',
    ageSource: 'always fresh (resolved live even on stale cards)',
  },
  'holders-dev': {
    ttlSeconds: SNAPSHOT_NUMBERS_TTL_SECONDS,
    semantics:
      'rides the 30s snapshot card only; NO hours-class without a signal ' +
      'trigger (rug/dev-dump moves in minutes, no trigger exists)',
    ageSource: 'card age (fresh 30s window; staleAgeMs on replays)',
  },
};

/**
 * Stale-trio invariant (`no-bit-without-age`, todo 41c): `stale: true`
 * REQUIRES a parseable ISO `staleAsOf` + a finite `staleAgeMs >= 0`;
 * fresh snapshots REQUIRE both `null`. The service guards the stale
 * branch with this (a corrupt history row falls through to honest
 * pending instead of serving a bit with no age) and specs pin every
 * construction site.
 */
export function isStaleTrioValid(
  stale: boolean,
  staleAsOf: string | null,
  staleAgeMs: number | null,
): boolean {
  if (stale) {
    return (
      typeof staleAsOf === 'string' &&
      staleAsOf !== '' &&
      !Number.isNaN(Date.parse(staleAsOf)) &&
      typeof staleAgeMs === 'number' &&
      Number.isFinite(staleAgeMs) &&
      staleAgeMs >= 0
    );
  }
  return staleAsOf === null && staleAgeMs === null;
}

/**
 * Tail-degraded signal (todo 41b — ONE decision, pinned): a card is
 * `degraded` when any tail extra timed out or was skipped
 * (`tail:*`), the fast path skipped dev holdings (`dev:fast-path`),
 * or the metadata-identity leg timed out (`metadata-identity`).
 * Degraded cards ARE cached with the bit set (30s numbers TTL — the
 * bit IS the honesty, unlike stale replays which must never cache).
 */
export function isTailDegraded(
  providerErrors: Readonly<Record<string, string>>,
): boolean {
  return Object.keys(providerErrors).some(
    (key) =>
      key.startsWith('tail:') ||
      key === 'dev:fast-path' ||
      key === 'metadata-identity',
  );
}
