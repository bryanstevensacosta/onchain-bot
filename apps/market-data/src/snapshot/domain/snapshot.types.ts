import { AddressKind } from 'address/domain/address-kind';
import { AddressProbe } from 'address/domain/address-probe.port';
import type { LaunchpadInfo } from 'launchpad/domain/launchpad-info';
import type { SnapshotVenue } from './snapshot-venue';
import type { SnapshotFdvAth } from './snapshot-fdv-ath';
import type { SnapshotQuote } from './snapshot-quote.types';

/**
 * Snapshot domain types (Tramo 3, todo 12, P50; enriched todo-3 gap).
 *
 * Canonical home of the snapshot shape: one snapshot per address kind
 * (token logic is the kind=token path). `status` is `'ready'` when at
 * least one provider contributed a field, `'pending'` only when every
 * provider failed or yielded nothing — then `providerErrors` names each
 * miss explicitly (never a silent shell) — and `'invalid'` when the
 * pre-fan-out existence gate proved the address dead (todo 21b) or the
 * pending-aging escalator converted N consecutive pendings (todo 21d);
 * an invalid card is all-null by construction. Moved verbatim from the
 * former `address/address-snapshot.service.ts` in todo 12; the quote
 * fields land here with the live aggregation.
 */
export interface AddressSnapshotInput {
  readonly chain: string;
  readonly value: string;
  readonly kindHint?: unknown;
  readonly probe?: AddressProbe | null;
}

export interface AddressSnapshot extends SnapshotQuote {
  readonly chain: string;
  readonly address: string;
  readonly kind: AddressKind;
  readonly key: string;
  readonly status: 'pending' | 'ready' | 'invalid';
  /**
   * Serve-stale marker (dexter plan todo 19b1, SWR floor): `true`
   * ONLY when this snapshot replays a `ready` history row because the
   * live fan-out failed (SWR floor) or while a background refresh
   * runs (SWR-now, todo 21a) — the prices may be dead. Fresh
   * snapshots carry `false` explicitly (spec-asserted at every
   * boundary; never `undefined`). `status` stays in
   * `{pending,ready,invalid}` (no new status value for stale): stale
   * rows answer `ready` + this bit, so downstream `hasIdentity`
   * resolution is untouched and honesty rides on the bit alone.
   */
  readonly stale: boolean;
  /**
   * ISO timestamp of the history row replayed (`createdAt`), `null`
   * on fresh snapshots. Renders as "data from X ago" downstream.
   */
  readonly staleAsOf: string | null;
  /**
   * `Date.now() - staleAsOf` in ms at serve time, `null` on fresh
   * snapshots. Always `<= SNAPSHOT_STALE_MAX_AGE_MS` when `stale`
   * is true (over-bound rows answer honest `pending`, never stale).
   */
  readonly staleAgeMs: number | null;
  /**
   * Tail-degraded marker (dexter plan todo 41b, ONE decision pinned):
   * `true` when any tail extra timed out or was skipped (`tail:*`),
   * the fast path skipped dev holdings (`dev:fast-path`), or the
   * metadata-identity leg timed out — the card served WITHOUT those
   * fields. Degraded cards ARE cached with the bit set (30s numbers
   * TTL — the bit IS the honesty). Always set explicitly (never
   * `undefined`), same rule as `stale`.
   */
  readonly degraded: boolean;
  /** Registry id from `asset_registry` (contract+chain), null when unregistered. */
  readonly assetId: string | null;
  /**
   * Origin launchpad (dexter-launchpad Wave 1, Lane D): `{ id, name, url }`
   * or `null` when no launchpad is detected. Resolved live per call,
   * never persisted to history, never throws into the snapshot.
   */
  readonly launchpad: LaunchpadInfo | null;
  /**
   * DEX venue of the best-liquidity pair (dexter venue-line, plan
   * todo 14): `{ dexId, labels }` or `null` when dexscreener has no
   * pair. Resolved live per call, never persisted to history, never
   * throws into the snapshot. Coexists with `launchpad` — the two
   * are detected independently and never mixed.
   */
  readonly venue: SnapshotVenue | null;
  /**
   * Best-liquidity pair creation time, ISO (dexter plan todo 63,
   * dexter `{{age}}`): converted ONCE from the discovery summary's
   * raw epoch ms (`buildSnapshot` — guards `typeof === 'number' &&
   * Number.isFinite && > 0`), `null` when no DexScreener pair exists
   * (incl. the Gecko venue fallback leg, which carries no creation
   * time) or the raw value is absent/garbage. TOP-LEVEL — never
   * inside `SnapshotVenue` (pinned). Resolved live per call, never
   * persisted to history (same lifecycle as `venue`). PAIR age, not
   * token deploy age: a migration can under-report (documented proxy
   * caveat).
   */
  readonly pairCreatedAt: string | null;
  /**
   * FDV ATH over own snapshot history plus the one-shot historical
   * seed (dexter fdv-ath, plan todo 16; seed todo 68): max `fdvUsd` +
   * setting row timestamp, or `null` on cold-start. Strictly
   * historical — read BEFORE the current row is persisted, so the
   * in-flight FDV is never substituted as ATH. ONE documented
   * exception (todo 68 clamp, never persisted): when an ATH exists AND
   * the in-flight FDV exceeds it, the resolved value is clamped UP to
   * the current FDV at `now` (a new peak observed live) — the clamp
   * never invents an ATH from `null` and never lowers an existing max.
   * Capped by the janitor window (`SNAPSHOT_HISTORY_RETENTION_DAYS`,
   * 90): max over surviving rows, not all time (the seed's day window
   * is the same 90d by default). Never throws into the snapshot.
   */
  readonly fdvAth: SnapshotFdvAth | null;
  readonly providers: ReadonlyArray<string>;
  /** Registry-order names that contributed at least one quote field. */
  readonly sources: ReadonlyArray<string>;
  /** Provider name -> failure reason (throw, timeout, or no-data). */
  readonly providerErrors: Record<string, string>;
}
