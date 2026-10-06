import {
  isZeroAddress,
  readAddress,
  readI32,
  readU128,
  readU16Number,
  readU64,
  readU8Number,
} from './codec-utils';
import { discriminatorEquals } from './solana-program-ids';

/**
 * Raydium pool decoders (Lane S, dexter plan todo 22).
 *
 * Layouts are the published `raydium-io/raydium-sdk-V2` structs
 * (field order quoted per decoder), verified field-by-field against
 * live mainnet accounts 2026-10-05 (mint/decimals/sqrtPrice all
 * cross-checked vs DexScreener ground truth):
 *
 * - AMMv4 `liquidityStateV4Layout` (752B, NO anchor discriminator —
 *   classic C struct; `status` u64@0 doubles as the shape check):
 *   32×u64 header (through `orderbookToInitTime`), then u128/u64
 *   swap counters, then `baseVault`@336 + `quoteVault`@368 +
 *   `baseMint`@400 + `quoteMint`@432 (+ lp/market legs, unread).
 *   Decimals travel per leg (`baseDecimal`@32, `quoteDecimal`@40).
 * - CPMM `CpmmPoolInfoLayout` (637B, `account:PoolState`):
 *   `configId`@8, `poolCreator`@40, `vaultA`@72, `vaultB`@104,
 *   `mintLp`@136, `mintA`@168, `mintB`@200, `mintProgramA/B`,
 *   `mintDecimalA` u8@331, `mintDecimalB` u8@332, `openTime` u64@373.
 * - CLMM `PoolInfoLayout` (1544B, `account:PoolState` — same NAME as
 *   CPMM, so the OWNER program selects the family, never the
 *   discriminator): `bump`@8, `configId`@9, `creator`@41,
 *   `mintA`@73, `mintB`@105, `vaultA`@137, `vaultB`@169,
 *   `observationId`@201, `mintDecimalsA`@233, `mintDecimalsB`@234,
 *   `tickSpacing`@235, `liquidity` u128@237, `sqrtPriceX64`
 *   u128@253, `tickCurrent` i32@269.
 *
 * Uninitialized rules (measured — legacy quirks documented):
 * - AMMv4: `status == 0` or both vaults zero. `poolOpenTime` is NOT
 *   consulted: legacy pools in the wild read 0 while fully live.
 * - CPMM: `openTime == 0` (live pools carry real timestamps) or
 *   both vaults zero. `status` is NOT consulted: live pools read 0.
 * - CLMM: `liquidity == 0`. (`status`@389 likewise reads 0 live.)
 *
 * Reserves are fee-inclusive by construction (vault token-account
 * balances accrue unsettled fees); no bps normalization is applied
 * here — the aggregator owns fee policy (later todo). sqrtPrice legs
 * (CLMM) are fee-independent spot by definition (Q64.64).
 */

export const RAYDIUM_AMM_V4_LEN = 752;
export const RAYDIUM_CPMM_MIN_LEN = 389;
export const RAYDIUM_CLMM_MIN_LEN = 273;

export interface DecodedRaydiumAmmV4 {
  readonly family: 'raydium-amm-v4';
  readonly status: bigint;
  readonly mintDecimalsA: number;
  readonly mintDecimalsB: number;
  readonly vaultA: string;
  readonly vaultB: string;
  readonly mintA: string;
  readonly mintB: string;
  readonly lpReserve: bigint;
}

export function decodeRaydiumAmmV4(
  bytes: Uint8Array,
): DecodedRaydiumAmmV4 | null {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.length < RAYDIUM_AMM_V4_LEN) {
      return null;
    }
    const status = readU64(bytes, 0);
    const mintDecimalsA = readU64(bytes, 32);
    const mintDecimalsB = readU64(bytes, 40);
    const vaultA = readAddress(bytes, 336);
    const vaultB = readAddress(bytes, 368);
    const mintA = readAddress(bytes, 400);
    const mintB = readAddress(bytes, 432);
    const lpReserve = readU64(bytes, 720);
    if (
      status === null ||
      mintDecimalsA === null ||
      mintDecimalsB === null ||
      vaultA === null ||
      vaultB === null ||
      mintA === null ||
      mintB === null ||
      lpReserve === null
    ) {
      return null;
    }
    if (status === 0n) return null;
    if (isZeroAddress(bytes, 336) && isZeroAddress(bytes, 368)) {
      return null;
    }
    if (mintDecimalsA > 18n || mintDecimalsB > 18n) return null;
    return {
      family: 'raydium-amm-v4',
      status,
      mintDecimalsA: Number(mintDecimalsA),
      mintDecimalsB: Number(mintDecimalsB),
      vaultA,
      vaultB,
      mintA,
      mintB,
      lpReserve,
    };
  } catch {
    return null;
  }
}

export interface DecodedRaydiumCpmm {
  readonly family: 'raydium-cpmm';
  readonly mintDecimalsA: number;
  readonly mintDecimalsB: number;
  readonly vaultA: string;
  readonly vaultB: string;
  readonly mintA: string;
  readonly mintB: string;
  readonly lpAmount: bigint;
  readonly openTime: bigint;
}

export function decodeRaydiumCpmm(
  bytes: Uint8Array,
): DecodedRaydiumCpmm | null {
  try {
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length < RAYDIUM_CPMM_MIN_LEN ||
      !discriminatorEquals(bytes, 'PoolState')
    ) {
      return null;
    }
    const vaultA = readAddress(bytes, 72);
    const vaultB = readAddress(bytes, 104);
    const mintA = readAddress(bytes, 168);
    const mintB = readAddress(bytes, 200);
    const mintDecimalsA = readU8Number(bytes, 331);
    const mintDecimalsB = readU8Number(bytes, 332);
    const lpAmount = readU64(bytes, 333);
    const openTime = readU64(bytes, 373);
    if (
      vaultA === null ||
      vaultB === null ||
      mintA === null ||
      mintB === null ||
      mintDecimalsA === null ||
      mintDecimalsB === null ||
      lpAmount === null ||
      openTime === null
    ) {
      return null;
    }
    if (openTime === 0n) return null;
    if (isZeroAddress(bytes, 72) && isZeroAddress(bytes, 104)) {
      return null;
    }
    if (mintDecimalsA > 18 || mintDecimalsB > 18) return null;
    return {
      family: 'raydium-cpmm',
      mintDecimalsA,
      mintDecimalsB,
      vaultA,
      vaultB,
      mintA,
      mintB,
      lpAmount,
      openTime,
    };
  } catch {
    return null;
  }
}

export interface DecodedRaydiumClmm {
  readonly family: 'raydium-clmm';
  readonly mintDecimalsA: number;
  readonly mintDecimalsB: number;
  readonly tickSpacing: number;
  readonly mintA: string;
  readonly mintB: string;
  readonly vaultA: string;
  readonly vaultB: string;
  readonly liquidity: bigint;
  readonly sqrtPriceX64: bigint;
  readonly tickCurrent: bigint;
}

export function decodeRaydiumClmm(
  bytes: Uint8Array,
): DecodedRaydiumClmm | null {
  try {
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length < RAYDIUM_CLMM_MIN_LEN ||
      !discriminatorEquals(bytes, 'PoolState')
    ) {
      return null;
    }
    const mintA = readAddress(bytes, 73);
    const mintB = readAddress(bytes, 105);
    const vaultA = readAddress(bytes, 137);
    const vaultB = readAddress(bytes, 169);
    const mintDecimalsA = readU8Number(bytes, 233);
    const mintDecimalsB = readU8Number(bytes, 234);
    const tickSpacing = readU16Number(bytes, 235);
    const liquidity = readU128(bytes, 237);
    const sqrtPriceX64 = readU128(bytes, 253);
    const tickCurrent = readI32(bytes, 269);
    if (
      mintA === null ||
      mintB === null ||
      vaultA === null ||
      vaultB === null ||
      mintDecimalsA === null ||
      mintDecimalsB === null ||
      tickSpacing === null ||
      liquidity === null ||
      sqrtPriceX64 === null ||
      tickCurrent === null
    ) {
      return null;
    }
    if (liquidity === 0n) return null;
    if (mintDecimalsA > 18 || mintDecimalsB > 18) return null;
    return {
      family: 'raydium-clmm',
      mintDecimalsA,
      mintDecimalsB,
      tickSpacing,
      mintA,
      mintB,
      vaultA,
      vaultB,
      liquidity,
      sqrtPriceX64,
      tickCurrent,
    };
  } catch {
    return null;
  }
}
