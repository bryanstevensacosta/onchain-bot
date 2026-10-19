/**
 * EVM honeypot reading (dexter plan todo 71, GoPlus Fase 1 — taxes
 * only). Pure domain: chains, unit parser, envelope classifier, the
 * definitive-absence negative memo, and the kill-switch resolver.
 *
 * WHAT THIS OWNS:
 *
 * - `HoneypotReading` — the dexter wire shape consumed by
 *   `toHoneypotOrNull`: `buy`/`sell` are PERCENT (0-100, finite) or
 *   `null` (unknown — NEVER 0), `sim` is ALWAYS `null` in Fase 1
 *   (no simulation source is wired; honeypot.is/SIM is explicitly
 *   DEFERRED — do not call or implement it here).
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
 * `sim` `'ok' | 'fail' | null`. Fase 1 emits `sim: null` ALWAYS.
 */
export interface HoneypotReading {
  readonly buy: number | null;
  readonly sell: number | null;
  readonly sim: 'ok' | 'fail' | null;
}

/** Classifier verdict (see the classification table above). */
export type HoneypotProbe =
  | { readonly kind: 'reading'; readonly reading: HoneypotReading }
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
      // Fase 1: taxes only. SIM is explicitly deferred (honeypot.is is
      // NOT called) — `sim` stays `null` until a simulation source
      // lands, and `null` never claims a round trip.
      sim: null,
    },
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
