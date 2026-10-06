import {
  isZeroAddress,
  readAddress,
  readI32,
  readU128,
  readU16Number,
} from './codec-utils';
import { discriminatorEquals } from './solana-program-ids';

/**
 * Orca Whirlpool decoder (Lane S, dexter plan todo 22).
 *
 * Layout is the `Whirlpool` struct in `orca-so/whirlpools`
 * (`programs/whirlpool/src/state/whirlpool.rs`, LEN 653 — the file
 * pins every width; note the easy-to-miss `feeTierIndexSeed[2]` +
 * `feeRate` + `protocolFeeRate` trio that shifts everything past
 * byte 43 by 4 vs the stale layout):
 * config@8, bump[1]@40, tickSpacing u16@41, feeTierIndexSeed[2]@43,
 * feeRate u16@45, protocolFeeRate u16@47, liquidity u128@49,
 * sqrtPrice u128@65 (Q64.64), tickCurrentIndex i32@81,
 * protocolFeeOwedA/B u64@85/93, tokenMintA@101, tokenVaultA@133,
 * feeGrowthGlobalA u128@165, tokenMintB@181, tokenVaultB@213,
 * feeGrowthGlobalB u128@245, rewardLastUpdated u64@261, rewards…
 *
 * Verified 2026-10-05 against the SOL/USDC whirlpool: mints decode
 * to WSOL/USDC and `(sqrtPrice/2^64)^2 × 10^(decA-decB)` reproduces
 * the DexScreener price to 5 decimals. Uninitialized ⟺
 * `liquidity == 0` (or both vaults zero). sqrtPrice is fee-
 * independent spot; vault balances are fee-inclusive (aggregator
 * owns fee policy — later todo).
 */

export const ORCA_WHIRLPOOL_LEN = 653;
export const ORCA_WHIRLPOOL_MIN_LEN = 261;

export interface DecodedOrcaWhirlpool {
  readonly family: 'orca-whirlpool';
  readonly tickSpacing: number;
  readonly feeRate: number;
  readonly mintA: string;
  readonly mintB: string;
  readonly vaultA: string;
  readonly vaultB: string;
  /** Always null: the Whirlpool struct carries no mint decimals. */
  readonly mintDecimalsA: null;
  /** Always null: the Whirlpool struct carries no mint decimals. */
  readonly mintDecimalsB: null;
  readonly liquidity: bigint;
  readonly sqrtPriceX64: bigint;
  readonly tickCurrentIndex: bigint;
}

export function decodeOrcaWhirlpool(
  bytes: Uint8Array,
): DecodedOrcaWhirlpool | null {
  try {
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length < ORCA_WHIRLPOOL_MIN_LEN ||
      !discriminatorEquals(bytes, 'Whirlpool')
    ) {
      return null;
    }
    const tickSpacing = readU16Number(bytes, 41);
    const feeRate = readU16Number(bytes, 45);
    const liquidity = readU128(bytes, 49);
    const sqrtPriceX64 = readU128(bytes, 65);
    const tickCurrentIndex = readI32(bytes, 81);
    const mintA = readAddress(bytes, 101);
    const vaultA = readAddress(bytes, 133);
    const mintB = readAddress(bytes, 181);
    const vaultB = readAddress(bytes, 213);
    if (
      tickSpacing === null ||
      feeRate === null ||
      liquidity === null ||
      sqrtPriceX64 === null ||
      tickCurrentIndex === null ||
      mintA === null ||
      vaultA === null ||
      mintB === null ||
      vaultB === null
    ) {
      return null;
    }
    if (liquidity === 0n) return null;
    if (isZeroAddress(bytes, 133) && isZeroAddress(bytes, 213)) {
      return null;
    }
    return {
      family: 'orca-whirlpool',
      tickSpacing,
      feeRate,
      mintA,
      mintB,
      vaultA,
      vaultB,
      mintDecimalsA: null,
      mintDecimalsB: null,
      liquidity,
      sqrtPriceX64,
      tickCurrentIndex,
    };
  } catch {
    return null;
  }
}
