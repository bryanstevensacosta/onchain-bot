import { AddressKind } from 'address/domain/address-kind';
import { AddressProbe } from 'address/domain/address-probe.port';
import type { LaunchpadInfo } from 'launchpad/domain/launchpad-info';
import type { SnapshotVenue } from './snapshot-venue';
import type { SnapshotFdvAth } from './snapshot-fdv-ath';
import type { SnapshotQuote } from './snapshot-quote.types';
import type { HoneypotReading } from './snapshot-honeypot';

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

/**
 * Verified pump.fun bonding-curve state (`rick-compact-card` §10.16).
 *
 * `onCurve` is the LITERAL `true` on purpose: only a verified,
 * decodable, NON-graduated pump curve ever produces an object.
 * Everything else — graduated (`complete === true`), foreign owner,
 * short/uninitialized account, RPC failure, timeout, non-pump token —
 * resolves `null`. Never `onCurve: false`: `null` IS "not on curve".
 * The five keys mirror the dexter consumer
 * (`apps/dexter-onchain-bot/src/scan/infrastructure/market-data/market-data.client.ts`
 * `MarketDataBondingCurve`) read-only; that file is not edited here.
 */
export interface BondingCurveInfo {
  readonly onCurve: true;
  readonly launchpadId: string;
  readonly quoteSymbol: string | null;
  readonly quoteMint: string | null;
  readonly progressPercent: number | null;
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
   * pump.fun bonding-curve state (`rick-compact-card` §10.16):
   * `{ onCurve: true, launchpadId, quoteSymbol, quoteMint,
   * progressPercent }` when the curve account was read and decoded
   * as NON-graduated, else `null` (never `onCurve: false` — `null`
   * is the "not on curve / unreadable" answer). REQUIRED key, always
   * emitted. Persisted INSIDE `snapshot_history.quote` (jsonb — no
   * migration) by the quote seam; SWR-now / stale replays serve it
   * back only while the row is within
   * `SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS` AND the object passes
   * the structural guard, otherwise `null` (the full card). Invalid
   * cards stay `null` unconditionally.
   */
  readonly bondingCurve: BondingCurveInfo | null;
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
  /**
   * EVM honeypot reading (dexter plan todo 71, GoPlus Fase 1 — taxes
   * only): `{buy, sell, sim}` where `buy`/`sell` are PERCENT 0-100
   * finite or `null` (unknown — never 0) and `sim` is ALWAYS `null`
   * in Fase 1 (honeypot.is/SIM deferred). The FIELD is present
   * whenever a reading was probed (even both-null taxes — "probed,
   * no data" is distinct from "no source"); ABSENT (`null`) when the
   * leg did not run: chain out of GoPlus scope (solana/robinhood/…),
   * kill-switch off, fast-path skip without a "known pool" reason, or
   * a transient source failure (fail-open, `degraded: true` +
   * `tail:honeypot` note). Not persisted to history (live per call,
   * same lifecycle as `venue`). Contract pinned against dexter
   * `toHoneypotOrNull` (read-only).
   */
  readonly honeypot: HoneypotReading | null;
  readonly providers: ReadonlyArray<string>;
  /** Registry-order names that contributed at least one quote field. */
  readonly sources: ReadonlyArray<string>;
  /** Provider name -> failure reason (throw, timeout, or no-data). */
  readonly providerErrors: Record<string, string>;
}
