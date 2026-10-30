import {
  isZeroAddress,
  readAddress,
  readU64,
  readU8Number,
} from './codec-utils';
import { discriminatorEquals } from './solana-program-ids';

/**
 * pump.fun bonding-curve decoder (Lane S, dexter plan todo 22; layout
 * extended by `rick-compact-card` §10.16 point 2).
 *
 * Layout (pump IDL `639b87f` 2026-10-13 + `@pump-fun/pump-sdk@4.3.1`,
 * cross-checked against a live mainnet account):
 *
 * ```text
 * disc [23,183,248,55,96,216,172,96]  8B   @0
 * virtual_token_reserves  u64   @8
 * virtual_quote_reserves  u64   @16   (historical name: virtual_sol_reserves)
 * real_token_reserves     u64   @24
 * real_quote_reserves     u64   @32   (historical name: real_sol_reserves)
 * token_total_supply      u64   @40
 * complete                bool  @48
 * creator                 Pubkey @49
 * is_mayhem_mode          bool  @81
 * is_cashback_coin        bool  @82
 * quote_mint              Pubkey @83   (32B, NOT an Option; all-zero = SOL-like)
 * creator_fee_bps         u64   @115
 * … append-only up to 166B
 * ```
 *
 * Eight historical lengths (49, 81, 82, 83, 115, 124, 125, 141, 151,
 * 166) are PREFIXES of the next: every read is length-gated (`len < 49`
 * → `null`; `creator` only when `len >= 81`; `quote_mint` only when
 * `len >= 115`) and the payload is zero-padded to 166 B BEFORE reading,
 * so an in-range offset never fails. Account SIZE does not distinguish
 * SOL from token-quoted curves — `quote_mint` is the only signal.
 *
 * Historical pump.fun struct field names say `sol`; the current IDL
 * renamed them to `*_quote_*` at the SAME offsets — the TS field names
 * (`virtualSolReserves` / `realSolReserves`) are frozen for consumers
 * and must NOT be renamed.
 */

export const PUMP_CURVE_MIN_LEN = 49;

/** Current (append-only) account size; the decode reads a padded copy. */
export const PUMP_CURVE_PADDED_LEN = 166;

/** Offset of `creator` (Pubkey) in the append-only layout. */
const CREATOR_OFFSET = 49;
/** Offset of `quote_mint` (Pubkey) in the append-only layout. */
const QUOTE_MINT_OFFSET = 83;

export interface DecodedPumpCurve {
  readonly family: 'pump';
  readonly virtualTokenReserves: bigint;
  readonly virtualSolReserves: bigint;
  readonly realTokenReserves: bigint;
  readonly realSolReserves: bigint;
  readonly tokenTotalSupply: bigint;
  readonly complete: boolean;
  /** Creator wallet, `null` when the account predates the field (< 81B). */
  readonly creator: string | null;
  /**
   * Quote mint of the curve, `null` when SOL-like (all-zero slot) or
   * when the account predates the field (< 115B).
   */
  readonly quoteMint: string | null;
}

export function decodePumpCurve(bytes: Uint8Array): DecodedPumpCurve | null {
  try {
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length < PUMP_CURVE_MIN_LEN ||
      !discriminatorEquals(bytes, 'BondingCurve')
    ) {
      return null;
    }
    const originalLength = bytes.length;
    // Zero-pad FIRST: every historical layout is a prefix of the next,
    // so in-range offsets past `originalLength` legitimately read 0.
    const padded = new Uint8Array(PUMP_CURVE_PADDED_LEN);
    padded.set(
      bytes.subarray(0, Math.min(originalLength, PUMP_CURVE_PADDED_LEN)),
      0,
    );
    const virtualTokenReserves = readU64(padded, 8);
    const virtualSolReserves = readU64(padded, 16);
    const realTokenReserves = readU64(padded, 24);
    const realSolReserves = readU64(padded, 32);
    const tokenTotalSupply = readU64(padded, 40);
    const complete = readU8Number(padded, 48);
    if (
      virtualTokenReserves === null ||
      virtualSolReserves === null ||
      realTokenReserves === null ||
      realSolReserves === null ||
      tokenTotalSupply === null ||
      complete === null
    ) {
      return null;
    }
    if (complete !== 0) return null;
    if (
      virtualTokenReserves === 0n &&
      virtualSolReserves === 0n &&
      realTokenReserves === 0n &&
      realSolReserves === 0n
    ) {
      return null;
    }
    const creator =
      originalLength < CREATOR_OFFSET + 32 ||
      isZeroAddress(padded, CREATOR_OFFSET)
        ? null
        : readAddress(padded, CREATOR_OFFSET);
    const quoteMint =
      originalLength < QUOTE_MINT_OFFSET + 32 ||
      isZeroAddress(padded, QUOTE_MINT_OFFSET)
        ? null
        : readAddress(padded, QUOTE_MINT_OFFSET);
    return {
      family: 'pump',
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply,
      complete: false,
      creator,
      quoteMint,
    };
  } catch {
    return null;
  }
}

/**
 * pump.fun sell-out denominator in TOKEN BASE UNITS: 793.1M tokens ×
 * 1e6 decimals. Pinned — deliberately NOT `tokenTotalSupply` (1e15),
 * which would flatten every curve to a near-0%.
 */
export const PUMP_CURVE_INITIAL_REAL_TOKEN_RESERVES = 793_100_000_000_000n;

/**
 * Bonding-curve completion, `clamp(100 × (1 − realTokenReserves / 793.1M
 * tokens), 0, 100)` rounded to 4 decimals (never to an integer — the
 * value is NOT monotonic: a sell lowers it).
 *
 * `null` when the reserve cannot be represented as a finite number.
 */
export function pumpCurveProgressPercent(
  curve: Pick<DecodedPumpCurve, 'realTokenReserves'>,
): number | null {
  const remaining = Number(curve.realTokenReserves);
  const initial = Number(PUMP_CURVE_INITIAL_REAL_TOKEN_RESERVES);
  if (!Number.isFinite(remaining)) return null;
  const percent = 100 * (1 - remaining / initial);
  if (!Number.isFinite(percent)) return null;
  const clamped = Math.min(100, Math.max(0, percent));
  return Math.round(clamped * 1e4) / 1e4;
}
