/**
 * Pump-suffix corroboration (dexter plan todo 48, lane c).
 *
 * R1 RULE (`.omo/plans/dexter-launchpad.md:57`, verbatim): "NO heuristica
 * del sufijo `...pump` como unica fuente (falsable; como mucho fast-path
 * documentado tras PDA)." The `...pump` mint suffix is CORROBORATING,
 * never decisive: suffix-alone MUST resolve null (mandatory falsifier,
 * spec-pinned below + at the detector level).
 *
 * R1 permits AT MOST a documented fast-path after PDA. This lane
 * implements LESS than the allowance: an observe-only annotation with
 * ZERO path change (no fast-path, no verdict change) — compliant by
 * construction, not by threshold.
 *
 * PRECEDENCE (pinned, cross-system — no "three vias in order"):
 *   1. override (dexter pipeline `resolveLaunchpad` in
 *      `token-scan.pipeline.ts` — curated row wins even over a positive
 *      detection; this table never sees it: by the time a detector id
 *      reaches here the override has already won or missed).
 *   2. detector-positive (`detectSolana` verdict — on-chain proof:
 *      PDA batch → heaven → Helius history).
 *   3. suffix-corroborated (THIS table: detector-positive `pump-fun`
 *      AND `hasPumpSuffix(mint)` → same id, `corroborated: true`).
 *   4. null (everything else — INCLUDING suffix-alone with a null
 *      detector, per R1).
 *
 * DECISION TABLE (venue x detector-output x suffix -> origin):
 * venue (`dexId`/tech) NEVER participates (origin != venue, R1 rule —
 * the venue column below pins that irrelevance, it does not feed it):
 *
 * | venue          | detector-output   | suffix `...pump` | origin              |
 * | ---------------- | ----------------- | ----------------- | ------------------- |
 * | any (incl. null)| `pump-fun`        | yes               | `pump-fun` (+corrob)|
 * | any (incl. null)| `pump-fun`        | no                | `pump-fun`          |
 * | any (incl. null)| other id          | yes / no          | other id (detector  |
 * |                  |                   |                   | wins; never re-keyed|
 * |                  |                   |                   | to `pump-fun`)      |
 * | any (incl. null)| null              | yes               | null (FALSIFIER)    |
 * | any (incl. null)| null              | no                | null (unknown)      |
 *
 * SEAM (pinned): `corroboratePumpSuffix` is called observe-only in
 * `detectInner`'s Solana branch (`launchpad-detector.service.ts`) —
 * AFTER the full verdict (fast legs + Helius leg) is computed. It
 * returns the verdict UNCHANGED; the only observable is a `debug`
 * log line. It is NEVER consulted inside the detect path (no PDA
 * skip, no Helius skip, no id rewrite).
 *
 * RENDERER CONTRACT (decided: mismo-null — NO marked low-confidence
 * value exists): suffix-alone resolves null, which renders EXACTLY
 * as unknown today (dexter 4 keys `""`; separator cleanup intact).
 * A corroborated positive renders byte-identically to an
 * uncorroborated positive (confidence comes from the detector, the
 * suffix adds none). Spec: detector-level falsifier (suffix mint +
 * all-miss -> null) + existing dexter null-render specs (re-verified
 * green, untouched).
 *
 * PROVENANCE (decided: silent-with-reason — NO new wire field):
 * `corroborated` is a LOCAL return consumed only by the seam's debug
 * log; it is never plumbed to `MarketDataSnapshot` / `ResolvedToken`
 * / preview / frontend (zero display delta — end-to-end churn for no
 * observable change is rejected). Reason recorded here, not just in
 * a commit message. Invariant (spec-pinned, mirrors the stale trio's
 * `no-bit-without-age`): `corroborated === false` whenever
 * `id === null` — no bit without a value, ever.
 *
 * Matching is case-SENSITIVE (`endsWith('pump')`): pump.fun graduate
 * mints end in lowercase `pump`; `PUMP`/`Pump` do not corroborate.
 * EVM hex addresses can never carry the suffix (no `u`/`m` in hex)
 * and EVM never reaches this table with a pump verdict anyway.
 */

/** Mint suffix corroborating (never proving) a pump.fun origin. */
export const PUMP_MINT_SUFFIX = 'pump';

/** Launchpad id this suffix may corroborate (never re-key to). */
export const PUMP_SUFFIX_LAUNCHPAD_ID = 'pump-fun';

export function hasPumpSuffix(mint: string): boolean {
  return typeof mint === 'string' && mint.endsWith(PUMP_MINT_SUFFIX);
}

export interface CorroboratedOrigin {
  /** Resolved origin id, or null (suffix-alone is ALWAYS null). */
  readonly id: string | null;
  /**
   * True ONLY when the detector already resolved `pump-fun` AND the
   * mint carries the suffix. False whenever `id` is null
   * (no-bit-without-value invariant).
   */
  readonly corroborated: boolean;
}

/**
 * Executable form of the decision table above (ranks 2-4; rank 1 —
 * the dexter-side override — wins upstream and never reaches here).
 * Pure: no I/O, no name/symbol reads (the suffix is mint shape, not
 * mutable metadata), never throws.
 */
export function corroboratePumpSuffix(
  detectorId: string | null | undefined,
  mint: string,
): CorroboratedOrigin {
  if (detectorId === null || detectorId === undefined || detectorId === '') {
    // R1 falsifier: suffix-alone -> null, even with the suffix present.
    return { id: null, corroborated: false };
  }
  return {
    id: detectorId,
    corroborated:
      detectorId === PUMP_SUFFIX_LAUNCHPAD_ID && hasPumpSuffix(mint),
  };
}
