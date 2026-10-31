/**
 * Persisted pump.fun bonding-curve replay policy (`rick-compact-card`
 * §10.16 replay follow-up, 2026-10-30).
 *
 * The curve used to be LIVE-ONLY (every replay literal pinned
 * `bondingCurve: null`), and the background refresh re-persisted a
 * ready row every ~30-40 s — so SWR-now re-armed forever and the
 * "next fresh serve" that would have flipped the card back to the
 * short layout NEVER happened. The fix persists the curve INSIDE the
 * existing `snapshot_history.quote` jsonb (NO migration, NO new
 * column) and serves it back on replays only while the ROW is fresh
 * enough to be trusted.
 *
 * Two rules, both pure:
 *
 * 1. `curveForReplay` mirrors dexter's `toBondingCurveOrNull` guard
 *    (`apps/dexter-onchain-bot/src/scan/infrastructure/market-data/market-data.client.ts`,
 *    read-only) so a corrupt/edited jsonb row can never render a fake
 *    short card: any structural violation resolves the WHOLE object
 *    to `null`, which every consumer already treats as "not on
 *    curve" (the full layout).
 * 2. The row age bound (`SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS`,
 *    env, default 600 000 = 10 min) keeps a curve that may already
 *    have graduated from being presented as current: an old row
 *    serves `null` (full card) instead of a stale "on curve" claim.
 *
 * Returned values are VERBATIM (no reshaping, no recompute): the
 * persisted object was already minted by the live seam — replay must
 * not invent a progress percentage or normalize symbols.
 */
import type { BondingCurveInfo } from './snapshot.types';

/**
 * Replay freshness bound default: 10 minutes. The background refresh
 * re-persists every ~30-40 s, so a healthy token stays well inside
 * this window; a row past it is treated as "curve may have moved".
 */
export const SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS_DEFAULT = 600_000;

/**
 * Resolve the replay bound from an env string (pure, spec-pinned):
 * unset/blank/non-numeric/non-finite/`<= 0` — or a positive fraction
 * that floors to `0` — resolves the pinned default. `Math.floor` on
 * every accepted value (ms are whole numbers; same idiom as the
 * neighbouring budget resolvers).
 */
export function resolveBondingCurveReplayMaxAgeMs(raw: unknown): number {
  let value: number;
  if (typeof raw === 'number') {
    value = raw;
  } else if (typeof raw === 'string') {
    value = Number(raw.trim());
  } else {
    return SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS_DEFAULT;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS_DEFAULT;
  }
  const floored = Math.floor(value);
  return floored > 0
    ? floored
    : SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS_DEFAULT;
}

/**
 * Optional string member: absent/`null` reads `null`, a non-empty
 * string passes through, anything else is a contract violation
 * (sentinel `undefined`) — copied from dexter's
 * `optionalNonEmptyStringOrUndefined` (same vocabulary, no new
 * validation layer).
 */
function optionalNonEmptyStringOrUndefined(
  raw: unknown,
): string | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string' || raw === '') return undefined;
  return raw;
}

/**
 * Serve the PERSISTED curve only when it is both structurally sound
 * and inside the row-age bound; otherwise `null` (the dexter consumer
 * then renders the FULL card — the honest fallback for "we cannot
 * claim this token is still on the curve").
 *
 * Structural guard (dexter `toBondingCurveOrNull`, plus the trimmed
 * `launchpadId` rule): non-object/array, `onCurve !== true` (only a
 * verified on-curve reading qualifies), a non-string/blank
 * `launchpadId`, a present `quoteSymbol`/`quoteMint` that is not a
 * non-empty string, or a present `progressPercent` that is not a
 * finite number in `[0, 100]` — any violation nulls the WHOLE object.
 * Absent/null optional members are legal (they read `null` on the
 * wire). Age guard: `ageMs` and `maxAgeMs` must be finite with
 * `0 <= ageMs <= maxAgeMs`.
 */
export function curveForReplay(
  curve: BondingCurveInfo | null | undefined,
  ageMs: number | null | undefined,
  maxAgeMs: number,
): BondingCurveInfo | null {
  if (
    typeof ageMs !== 'number' ||
    !Number.isFinite(ageMs) ||
    typeof maxAgeMs !== 'number' ||
    !Number.isFinite(maxAgeMs) ||
    ageMs < 0 ||
    ageMs > maxAgeMs
  ) {
    return null;
  }
  if (typeof curve !== 'object' || curve === null || Array.isArray(curve)) {
    return null;
  }
  const candidate = curve as unknown as Record<string, unknown>;
  if (candidate['onCurve'] !== true) return null;
  const launchpadId = candidate['launchpadId'];
  if (typeof launchpadId !== 'string' || launchpadId.trim() === '') {
    return null;
  }
  const quoteSymbol = optionalNonEmptyStringOrUndefined(
    candidate['quoteSymbol'],
  );
  const quoteMint = optionalNonEmptyStringOrUndefined(candidate['quoteMint']);
  if (quoteSymbol === undefined || quoteMint === undefined) return null;
  const rawProgress = candidate['progressPercent'];
  if (rawProgress !== null && rawProgress !== undefined) {
    if (typeof rawProgress !== 'number' || !Number.isFinite(rawProgress)) {
      return null;
    }
    if (rawProgress < 0 || rawProgress > 100) return null;
  }
  // VERBATIM: the persisted object already passed the live seam — no
  // reshaping, no recompute, no normalization.
  return curve;
}

/**
 * Replay freshness bound resolved ONCE at module load (env read idiom
 * shared with `SNAPSHOT_PUMP_CURVE_TIMEOUT_MS`): non-finite/`<= 0`/
 * garbage resolves the 10-minute default.
 */
export const SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS =
  resolveBondingCurveReplayMaxAgeMs(
    process.env['SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS'],
  );
