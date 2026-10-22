/**
 * EVM honeypot reading (dexter plan todo 71 + `rick-compact-card` D1/D3
 * — GoPlus taxes + SIM verdict + LP lock). Pure domain: chains, unit
 * parsers, envelope classifier, the definitive-absence negative memo,
 * and the two kill-switch resolvers.
 *
 * WHAT THIS OWNS:
 *
 * - `HoneypotReading` — the dexter wire shape consumed by
 *   `toHoneypotOrNull`: `buy`/`sell` are PERCENT (0-100, finite) or
 *   `null` (unknown — NEVER 0); `sim` is `'ok' | 'fail' | null`.
 *   `sim` is a THIRD-PARTY VERDICT from GoPlus `token_security`
 *   (`is_honeypot`/`cannot_buy`/`cannot_sell_all`) — NOT a local
 *   simulation of ours. The `SIM` label is kept for visual parity
 *   (Rick); provenance is GoPlus, and `null` never claims a round
 *   trip. honeypot.is is still NOT wired (KODA answers 404 there).
 * - `LpLockReading` — token-level LP lock/burn percentages from
 *   GoPlus `lp_holders` (also this same call): `lockedPercent` sums
 *   `is_locked=1` rows that are NOT the null address, `burnedPercent`
 *   sums the null-address rows. `percent` arrives as a FRACTION →
 *   ×100, 4dp, clamped 0-100. Top-N caveat: a lock outside the
 *   returned window is a false NEGATIVE, never a false positive; the
 *   reading is token-level (all pools), so a secondary-pool lock can
 *   light the badge on the primary pool's card (heuristic, documented
 *   in the plan D3).
 * - `GOPLUS_CHAIN_IDS` + `goplusChainId`: ONLY ethereum=1, bsc=56,
 *   base=8453 (the chains probed live 2026-10-19). Every other chain
 *   (solana, robinhood, arbitrum, polygon, …) resolves `null` and the
 *   caller stays SILENT: no call, no field, no note.
 * - `parseTaxPercent`: GoPlus `buy_tax`/`sell_tax` are strings
 *   carrying a FRACTION ("0.04" = 4%; docs: scale 0-1) — converted
 *   ×100 and rounded to 4 decimals (`Math.round(x*100*1e4)/1e4`).
 *   Absent / blank / non-numeric resolves `null` (unknown, never 0 —
 *   CAKE is the live witness of absent tax fields); a percent OUTSIDE
 *   0-100 resolves `null` too (never clamped: a clamp would invent a
 *   non-measured value).
 * - `classifyTokenSecurity`: the GoPlus envelope verdict
 *   (`GET /api/v1/token_security/{chainId}?contract_addresses=…`).
 *   The chain-unsupported error is HTTP 200 + body `code: 2022` —
 *   the HTTP status is MEANINGLESS here, the BODY is the verdict
 *   (witness: `{"code":2022,"message":"The main chain is not
 *   supported","result":null}` + header `x-code: 2022`).
 * - `HoneypotNegativeMemo`: in-process, bounded 500, 6h TTL memory of
 *   DEFINITIVE absences only (see classification below), so an
 *   address GoPlus truly does not know is not re-fetched on every
 *   snapshot. Transient classes are NEVER memoized — they retry on
 *   the next request. Resets on deploy (same class as the breaker/
 *   governor state).
 * - `resolveHoneypotEnabled`: kill-switch `SNAPSHOT_HONEYPOT_ENABLED`,
 *   default ENABLED; only an explicit false-ish token disables.
 *   Disabled ⇒ no call AND no field (silence).
 * - `resolveSimVerdictEnabled`: kill-switch
 *   `SNAPSHOT_SIM_VERDICT_ENABLED` (`rick-compact-card` D1), default
 *   ENABLED; only an explicit false-ish token disables. OFF ⇒ the
 *   reading's `sim` is nulled at the service seam — taxes AND
 *   `lpLock` survive (blast-radius switch for active templates that
 *   already render `{{honeypotLine}}`).
 * - `resolveHoneypotTimeoutMs`: the honeypot TAIL budget
 *   (`SNAPSHOT_HONEYPOT_TIMEOUT_MS`, default 1500 — the
 *   `LAUNCHPAD_SLOW_LEG_TIMEOUT_MS` precedent). Governs ONLY the
 *   `tail:honeypot` wait: the live GoPlus RTT (~389-467ms) never fit
 *   the shared 400ms extras budget, while venue/dev keep that 400ms
 *   byte-identical.
 *
 * CLASSIFICATION (pinned — the memo contract depends on it):
 *
 * | Envelope observation                              | Verdict            |
 * | ------------------------------------------------- | ------------------ |
 * | body not a record (incl. arrays, strings, null)   | transient          |
 * | `code === 2022` (strict number)                   | definitive-absence |
 * | `code !== 1` (incl. non-number / missing)         | transient          |
 * | `code === 1` + `result` not a record              | definitive-absence |
 * | entry (`result[<address-lowercase>]`) undefined   | definitive-absence |
 * | entry present but not a record (incl. null)       | transient          |
 * | entry a record                                    | reading            |
 *
 * ONLY the definitive rows are memoized — chain-unsupported (2022) and
 * address-absent. The `code !== 1` and broken-entry rows are envelope
 * damage (odd codes, shape drift), NOT verdicts: memoizing them would
 * pin a transient upstream condition for 6h. The reading row is
 * ALWAYS emitted when the entry is present, even with both tax sides
 * `null` — "probed, no tax data" (CAKE) is distinct from "no source"
 * (no field at all).
 */

/** GoPlus chain ids actually probed live (2026-10-19): 1 / 56 / 8453. */
export const GOPLUS_CHAIN_IDS: Readonly<Record<string, number>> = {
  ethereum: 1,
  bsc: 56,
  base: 8453,
};

/**
 * Canonical chain id -> GoPlus chain id, or `null` when the chain is
 * out of the probed scope (caller stays silent — no call, no field).
 */
export function goplusChainId(chain: string): number | null {
  if (typeof chain !== 'string') return null;
  const id = GOPLUS_CHAIN_IDS[chain.trim().toLowerCase()];
  return typeof id === 'number' && Number.isFinite(id) ? id : null;
}

/**
 * Wire shape of ONE honeypot reading (dexter `toHoneypotOrNull`
 * contract): `buy`/`sell` PERCENT 0-100 finite (or `null` = unknown),
 * `sim` `'ok' | 'fail' | null` (GoPlus verdict; `null` = no definitive
 * verdict — never invented).
 */
export interface HoneypotReading {
  readonly buy: number | null;
  readonly sell: number | null;
  readonly sim: 'ok' | 'fail' | null;
}

/**
 * Token-level LP lock/burn reading from GoPlus `lp_holders`
 * (`rick-compact-card` D3). Both numbers are ALWAYS present: `0` is a
 * measured bucket-zero, NOT "no data" — the no-data case is
 * `lpLock: null` (holders absent/empty, or no row carried a parseable
 * `percent`).
 */
export interface LpLockReading {
  /** 0-100: Σ percent of rows with strict `is_locked=1`, excluding the null address. */
  readonly lockedPercent: number;
  /** 0-100: Σ percent of rows whose address is the null (burn) address — regardless of `is_locked`. */
  readonly burnedPercent: number;
}

/** Classifier verdict (see the classification table above). */
export type HoneypotProbe =
  | {
      readonly kind: 'reading';
      readonly reading: HoneypotReading;
      readonly lpLock: LpLockReading | null;
    }
  | { readonly kind: 'definitive-absence' }
  | { readonly kind: 'transient' };

/**
 * Per-probe axios ceiling (`GoplusService`): bounds the abandoned
 * work when the honeypot tail budget (`SNAPSHOT_HONEYPOT_TIMEOUT_MS`,
 * default 1500) already gave up on the leg. Same pinned number as the
 * ATH-seed request timeout.
 */
export const SNAPSHOT_HONEYPOT_REQUEST_TIMEOUT_MS = 2_000;

/**
 * Honeypot-tail budget (the `LAUNCHPAD_SLOW_LEG_TIMEOUT_MS` precedent):
 * the GoPlus leg is OUT of the shared 400ms extras budget — its live
 * RTT (~389ms lane-time, RE-MEASURED 428-467ms the same day) lost that
 * race. Env `SNAPSHOT_HONEYPOT_TIMEOUT_MS`, default 1500; governs ONLY
 * the `tail:honeypot` wait (venue/dev keep
 * `SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS` byte-identical). Read once at
 * construction, like the kill-switch.
 */
export const SNAPSHOT_HONEYPOT_TIMEOUT_MS_DEFAULT = 1_500;

/**
 * Non-finite / non-positive / garbage raw -> the pinned default (same
 * resolver shape as `resolveDetectorSlowLegTimeoutMs`).
 */
export function resolveHoneypotTimeoutMs(raw: string | undefined): number {
  if (raw === undefined) return SNAPSHOT_HONEYPOT_TIMEOUT_MS_DEFAULT;
  const ms = Number(raw);
  if (!Number.isFinite(ms) || ms <= 0) {
    return SNAPSHOT_HONEYPOT_TIMEOUT_MS_DEFAULT;
  }
  return Math.floor(ms);
}

/**
 * Negative-memo TTL (6h, pinned): a definitive absence suppresses
 * re-fires for 6h (deploy restarts clear the map). Taxes mutate in
 * minutes-to-hours; a memoized ABSENCE only skips a fetch that would
 * answer "still absent" — the snapshot card itself is never cached
 * through this memo.
 */
export const SNAPSHOT_HONEYPOT_NEGATIVE_TTL_MS = 6 * 60 * 60 * 1000;

/** Bounded negative-memo capacity (same 500 precedent as the ATH memo). */
export const SNAPSHOT_HONEYPOT_MEMO_MAX = 500;

/**
 * Transient-failure note (service-side `tail:honeypot` reason): the
 * card serves WITHOUT the field, `degraded: true`, and the next
 * request retries (transients are never memoized).
 */
export const HONEYPOT_TRANSIENT_NOTE =
  'transient source failure — degraded to null, fail-open (retries next request)';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Fraction -> percent, 4-decimal rounded. Guards (never clamp, never
 * coerce): non-finite -> null; percent outside 0-100 -> null. An
 * explicit `0` IS a measured zero (live witnesses: PEPE/AERO "0"/"0").
 */
function fractionToPercent(fraction: number): number | null {
  if (!Number.isFinite(fraction)) return null;
  const percent = Math.round(fraction * 100 * 1e4) / 1e4;
  if (percent < 0 || percent > 100) return null;
  return percent;
}

/**
 * GoPlus tax field -> PERCENT (0-100) or `null` (unknown). Accepts
 * number or string (live shape: strings; the SDK shape can be
 * numeric). Absent (`undefined`/`null`), blank (`""`) and
 * non-numeric strings resolve `null` — the live CAKE witness where
 * both tax keys were ABSENT (`?`, never 0).
 */
export function parseTaxPercent(value: unknown): number | null {
  if (typeof value === 'number') return fractionToPercent(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return fractionToPercent(parsed);
}

/**
 * GoPlus boolean flag -> `0 | 1 | null`. Accepts the live string shape
 * (`"0"`/`"1"`) and the SDK numeric shape (`0`/`1`); ANYTHING else
 * (absent, null, blank, `"true"`, `2`, objects) is `null` = no verdict
 * for that flag — never coerced.
 */
function parseFlag01(value: unknown): 0 | 1 | null {
  if (value === 0 || value === '0') return 0;
  if (value === 1 || value === '1') return 1;
  return null;
}

/**
 * `sim` verdict matrix (`rick-compact-card` D1):
 *
 * - `fail` when ANY of `is_honeypot`/`cannot_buy`/`cannot_sell_all`
 *   normalizes to 1 — the two `cannot_*` flags can only force fail,
 *   they are never required.
 * - `ok` ONLY when `is_honeypot` is PRESENT and 0 (absent → no
 *   verdict; `cannot_*` presence never upgrades absence to ok).
 * - `null` otherwise (transient/definitive absence are handled by the
 *   envelope classifier BEFORE this function — never invented).
 */
function resolveSimVerdict(
  entry: Record<string, unknown>,
): 'ok' | 'fail' | null {
  const honeypot = parseFlag01(entry.is_honeypot);
  const cannotBuy = parseFlag01(entry.cannot_buy);
  const cannotSellAll = parseFlag01(entry.cannot_sell_all);
  if (honeypot === 1 || cannotBuy === 1 || cannotSellAll === 1) return 'fail';
  if (honeypot === 0) return 'ok';
  return null;
}

/** The canonical EVM null/burn address (lowercase, case-insensitive match). */
const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * GoPlus `lp_holders[].percent` fraction -> PERCENT, 4dp, CLAMPED
 * 0-100 (D3 pins the clamp for the lock buckets; unlike the tax parser,
 * which rejects out-of-range as non-measured). Non-numeric/absent ->
 * `null` so the row is omitted.
 */
function fractionToClampedPercent(value: unknown): number | null {
  let fraction: number;
  if (typeof value === 'number') {
    fraction = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    fraction = Number(trimmed);
  } else {
    return null;
  }
  if (!Number.isFinite(fraction)) return null;
  const percent = Math.round(fraction * 100 * 1e4) / 1e4;
  return Math.min(100, Math.max(0, percent));
}

/** Strict GoPlus lock flag: only `1|"1"` means locked (D3). */
function isLockedFlag(value: unknown): boolean {
  return value === 1 || value === '1';
}

/** Kill-clamp a summed bucket into 0-100 with 4dp rounding. */
function clampPercent(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 1e4) / 1e4;
}

/**
 * GoPlus `lp_holders` -> `LpLockReading | null` (D3, ONE null rule):
 *
 * - `lp_holders` absent / not an array / empty -> `null` (no data —
 *   never a `0%` claim). The same `null` applies when the transfer
 *   happens with `lp_holder_count > 0`: the API returned no rows, so
 *   we do not assert zero.
 * - At least one row carries a parseable `percent` -> an object with
 *   BOTH numbers (`0` when that bucket contributed nothing).
 * - Rows with a non-parseable `percent` are omitted entirely.
 * - Null Address (case-insensitive `0x000…000`) counts as BURNED
 *   regardless of `is_locked`. Otherwise only strict `is_locked=1|"1"`
 *   contributes to `lockedPercent`.
 */
function classifyLpLock(entry: Record<string, unknown>): LpLockReading | null {
  const holders = entry.lp_holders;
  if (!Array.isArray(holders) || holders.length === 0) return null;
  let sawPercent = false;
  let locked = 0;
  let burned = 0;
  for (const row of holders) {
    if (!isRecord(row)) continue;
    const percent = fractionToClampedPercent(row.percent);
    if (percent === null) continue;
    sawPercent = true;
    const address =
      typeof row.address === 'string' ? row.address.trim().toLowerCase() : '';
    if (address === NULL_ADDRESS) {
      burned += percent;
    } else if (isLockedFlag(row.is_locked)) {
      locked += percent;
    }
  }
  if (!sawPercent) return null;
  return {
    lockedPercent: clampPercent(locked),
    burnedPercent: clampPercent(burned),
  };
}

/** Shared immutable verdicts (no allocation per call). */
const TRANSIENT: HoneypotProbe = { kind: 'transient' };
const DEFINITIVE: HoneypotProbe = { kind: 'definitive-absence' };

/**
 * Classify ONE GoPlus `token_security` response body for ONE address
 * (the caller sends exactly one address per request — batch >1 returns
 * only the first entry, live-pinned). See the module table for the
 * complete rule set; the function NEVER throws and NEVER touches the
 * network.
 */
export function classifyTokenSecurity(
  body: unknown,
  address: string,
): HoneypotProbe {
  if (!isRecord(body)) return TRANSIENT;
  // Chain-unsupported rides the BODY at HTTP 200 (the wire status is
  // not a verdict): strict numeric 2022 -> definitive.
  if (body.code === 2022) return DEFINITIVE;
  // Any other non-1 code (including a missing/non-numeric code) is
  // envelope damage — a transient, never memoized.
  if (body.code !== 1) return TRANSIENT;
  // `result` not a record under a success code: the address is absent
  // from the result map -> definitive absence.
  if (!isRecord(body.result)) return DEFINITIVE;
  const key = typeof address === 'string' ? address.trim().toLowerCase() : '';
  const entry = body.result[key];
  // Absent entry -> the source definitively has no row for it.
  if (entry === undefined) return DEFINITIVE;
  // Present but not a record (incl. explicit null): broken envelope
  // class — transient, never memoized.
  if (!isRecord(entry)) return TRANSIENT;
  return {
    kind: 'reading',
    reading: {
      buy: parseTaxPercent(entry.buy_tax),
      sell: parseTaxPercent(entry.sell_tax),
      // GoPlus verdict (`rick-compact-card` D1): third-party, not a
      // local simulation; `null` = no definitive verdict.
      sim: resolveSimVerdict(entry),
    },
    // Token-level LP lock/burn (`rick-compact-card` D3), same call.
    lpLock: classifyLpLock(entry),
  };
}

/**
 * Bounded in-process negative memo (todo 71). `has(key, now)` also
 * lazily evicts the expired entry; `remember` refreshes the insertion
 * order (true FIFO on the capacity cap) and never grows past
 * `maxEntries`. Deliberately NOT a cache of anything but "definitive
 * absence" — transient classes are excluded by the caller.
 */
export class HoneypotNegativeMemo {
  private readonly entries = new Map<string, number>();

  public constructor(
    private readonly ttlMs: number = SNAPSHOT_HONEYPOT_NEGATIVE_TTL_MS,
    private readonly maxEntries: number = SNAPSHOT_HONEYPOT_MEMO_MAX,
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
 * Kill-switch (todo 71): default ENABLED; only an explicit false-ish
 * token disables (`SNAPSHOT_HONEYPOT_ENABLED=0|false|off|no|disabled`).
 * Unset/blank/anything else keeps it on — the leg is additive,
 * fail-open and budget-bounded, so "on" is the safe default. OFF ⇒
 * no call AND no field (silence), same shape as the chain gate.
 */
export function resolveHoneypotEnabled(raw: string | undefined): boolean {
  if (typeof raw !== 'string') return true;
  const value = raw.trim().toLowerCase();
  if (value === '') return true;
  return !['0', 'false', 'off', 'no', 'disabled'].includes(value);
}

/**
 * SIM-verdict kill-switch (`rick-compact-card` D1): default ENABLED;
 * only an explicit false-ish token disables
 * (`SNAPSHOT_SIM_VERDICT_ENABLED=0|false|off|no|disabled`). OFF ⇒ the
 * service nulls ONLY `sim` on a reading — taxes and `lpLock` survive
 * (the blast-radius switch for templates that already render
 * `{{honeypotLine}}`). Same resolver shape as the leg switch above
 * (one semantics, two switches — pinned by its own spec).
 */
export function resolveSimVerdictEnabled(raw: string | undefined): boolean {
  return resolveHoneypotEnabled(raw);
}
