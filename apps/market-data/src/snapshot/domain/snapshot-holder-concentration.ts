import { resolveHoneypotEnabled } from './snapshot-honeypot';

/**
 * Holder concentration policy + env resolvers (`rick-compact-card` §10,
 * lane TH). Pure domain: the frozen numbers the calculator consumes and
 * the two env seams of the dedicated `solana-holders` fetcher.
 *
 * WHAT THIS OWNS:
 *
 * - `HOLDER_CONCENTRATION_TOP_N` = 5 — the rendered row carries at most
 *   five percents (`topPercents`); `<5` renders what exists (never
 *   padded) and `0` is silence.
 * - `HOLDER_CONCENTRATION_TOP10_N` = 10 — the bracket sums the first
 *   `min(10, n)` holders of the SAME merged/filtered/sorted array used
 *   for the five percents (so `sum(topPercents) <= top10Percent` holds
 *   by construction). Without the `min`, every token with fewer than
 *   10 wallets would sum `undefined` into `NaN` and go silent — exactly
 *   the new-token case the row exists for.
 * - `HOLDER_CONCENTRATION_PERCENT_EPSILON` = 1e-9 percentage points —
 *   the ONE ε of this app for the `sum(top5) <= top10` coherence guard
 *   (dexter ships its own copy of the same literal; neither app imports
 *   the other). It absorbs re-accumulation/display rounding, never
 *   serialization (JSON preserves the exact double).
 * - `resolveHolderConcentrationTimeoutMs` — the fetcher's OWN budget
 *   (`SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS`, default 3800; see the
 *   constant for the measurement behind the number). On expiry the leg
 *   resolves `null` and nothing else; abandoned RPC calls die on their
 *   internal timeouts and the 4000ms fan-out deadline stays the
 *   backstop.
 * - `resolveHolderConcentrationEnabled` — kill-switch
 *   (`SNAPSHOT_HOLDER_CONCENTRATION_ENABLED`, default ENABLED; only an
 *   explicit false-ish token disables). OFF ⇒ zero RPC, no field, no
 *   note (silence). Delegates to `resolveHoneypotEnabled` — ONE
 *   false-ish vocabulary across both switches (same precedent as
 *   `resolveSimVerdictEnabled`).
 *
 * CALCULATION POLICY (v1, frozen — the calculator implements exactly
 * this order: merge → exclusions → descending sort → accumulators →
 * cut):
 *
 * 1. Denominator = TOTAL supply (`getTokenSupply`). It is the only
 *    on-chain supply; circulating supply is aggregator-reported and
 *    often absent.
 * 2. Merge per WALLET in BigInt: `getTokenLargestAccounts` returns
 *    token ACCOUNTS (ATAs, <=20, no owner), so each is decoded through
 *    the EXISTING `decodeTokenAccount` and amounts are summed by
 *    `owner`. `Number` conversion happens ONCE at percent time
 *    (`Number(amount) / Number(supply) * 100`; u64 -> double relative
 *    error ~1e-16, acceptable for a percentage).
 * 3. Exclusions are applied to the MERGED list BEFORE sorting and
 *    cutting — cutting first would break `sum(top5) <= top10`. In
 *    order: (i) uninitialized token accounts (`isUninitializedTokenAccount`
 *    — mint AND owner zero; without this they would masquerade as the
 *    burn address), (ii) owner == `11111111111111111111111111111111`
 *    (the System Program address used as a holder: ONE burn pattern,
 *    not "the canonical sink"), (iii) wallet account `null` on-chain
 *    (e.g. the incinerator — ownership is never invented), (iv)
 *    program-owned wallet (wallet account owner != System Program:
 *    pools/curves/PDAs/vaults). ACCEPTED cost of (iv): a Squads
 *    multisig falls too — a false NEGATIVE, never a false positive.
 *    Brand/CEX allowlists are deliberately NOT implemented (no keyless
 *    source = invention).
 * 4. Cut: descending by merged amount; `topPercents` = first `min(5,n)`;
 *    `top10Percent` = sum of the first `min(10,n)` of that same array.
 * 5. Hard guards: supply `0n`/null -> `null`; any non-finite percentage
 *    -> `null` (checked before emit — `JSON.stringify` would silently
 *    turn `NaN` into `null`); `top10Percent` outside
 *    `[-ε, 100+ε]` -> `null`; inside that margin it is CLAMPED to
 *    `[0, 100]` (a legitimately 100%-held token must not be discarded
 *    over a ulp). Individual values are clamped to `[0,100]` too (the
 *    dexter client rejects out-of-range values — it rounds to 1dp for
 *    display anyway).
 * 6. HONEST LOWER BOUND: `getTokenLargestAccounts` returns <=20
 *    accounts, so the post-merge top-10 is a lower bound of the real
 *    wallet top-10 — never an overstatement. This row is a DIFFERENT
 *    metric from the legacy `top10HolderPercent` (per ACCOUNT,
 *    pool-inclusive, no exclusions): a template must never mix both.
 *
 * SCOPE: Solana-only (`SNAPSHOT_HOLDER_CONCENTRATION` v1). EVM has no
 * keyless per-wallet holder source (Etherscan `tokenholderlist` is PRO,
 * BSC has no Blockscout, Moralis/Birdeye need keys) — EVM cards stay
 * silent. Creator-bold is OUT of v1 (no creator-wallet resolver exists).
 */

/** Rendered row length: at most five percents (`[]` = silence). */
export const HOLDER_CONCENTRATION_TOP_N = 5;

/** Bracket width: sum of the first `min(10, n)` merged holders. */
export const HOLDER_CONCENTRATION_TOP10_N = 10;

/** The ONE coherence ε (percentage points) for `sum(top5) <= top10`. */
export const HOLDER_CONCENTRATION_PERCENT_EPSILON = 1e-9;

/**
 * Own fetcher budget (`SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS`) —
 * same resolver shape as `resolveHoneypotTimeoutMs`, different number.
 * Governs ONLY the `solana-holders` leg; on expiry it resolves `null`
 * and nothing else.
 *
 * WHY 3800 (measured 2026-10-26 on the keyed Helius primary path, the
 * transport this leg actually runs on): the leg is FOUR sequential
 * rounds — `getTokenSupply` ~247ms, `getTokenLargestAccounts`
 * 2360-2936ms (n=20), then TWO `getMultipleAccounts` batches ~257ms
 * each — so the happy path lands at ~3.15-3.70s. The original 1500
 * budget (copied from the honeypot tail) sat BELOW that measured band,
 * and every live card observed before this change read
 * `holderConcentration: null`. 3800 fits the measured band with margin
 * and still sits BELOW the 4000ms `SNAPSHOT_FANOUT_DEADLINE_MS`, which
 * remains the hard backstop (an over-run there is abandoned fail-open
 * with its own note, never a blocked card). On a fast transport (~1s
 * total) the budget never binds, so the number costs nothing where it
 * is not needed.
 */
export const SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS_DEFAULT = 3_800;

/**
 * Non-finite / non-positive / garbage raw -> the pinned default (same
 * resolver shape as `resolveHoneypotTimeoutMs`).
 */
export function resolveHolderConcentrationTimeoutMs(
  raw: string | undefined,
): number {
  if (raw === undefined) {
    return SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS_DEFAULT;
  }
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) {
    return SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS_DEFAULT;
  }
  return Math.floor(ms);
}

/**
 * Kill-switch (`SNAPSHOT_HOLDER_CONCENTRATION_ENABLED`): default
 * ENABLED; only an explicit false-ish token disables
 * (`0|false|off|no|disabled`). OFF ⇒ no calls AND no field (silence),
 * like the chain gate. Delegates to the honeypot resolver so both
 * switches share ONE vocabulary.
 */
export function resolveHolderConcentrationEnabled(
  raw: string | undefined,
): boolean {
  return resolveHoneypotEnabled(raw);
}
