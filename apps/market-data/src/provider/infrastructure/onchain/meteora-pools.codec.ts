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
 * Meteora DLMM + DBC decoders (Lane S, dexter plan todo 22).
 *
 * Both layouts come from the published IDLs (field order quoted),
 * verified against live mainnet accounts 2026-10-05:
 *
 * - DLMM `LbPair` (`MeteoraAg/dlmm-sdk/idls/dlmm.json`, 904B,
 *   discriminator == the IDL's `[33,11,49,98,181,101,177,13]`):
 *   `StaticParameters` (32B, NO binStep inside — it is a separate
 *   top-level field)@8, `VariableParameters` (32B)@40,
 *   `bumpSeed`[1]@72, `binStepSeed`[2]@73, `pairType`@75,
 *   `activeId` i32@76, `binStep` u16@80, `status`@82,
 *   `requireBaseFactorSeed`@83, `baseFactorSeed`[2]@84,
 *   `activationType`@86, `creatorPoolOnOffControl`@87,
 *   `tokenXMint`@88, `tokenYMint`@120, `reserveX`@152,
 *   `reserveY`@184 (vault pubkeys — balances come from the vault
 *   token accounts). Verified: binStepSeed == binStep (25) and
 *   `(1+binStep/1e4)^activeId` reproduces the RAY/SOL price.
 * - DBC `VirtualPool{poolState: PoolState}`
 *   (`MeteoraAg/dynamic-bonding-curve-sdk` DBC IDL, 424B exact,
 *   discriminator == the IDL's `[213,224,5,209,98,69,119,92]`):
 *   `VolatilityTracker` (64B)@8, `config`@72, `creator`@104,
 *   `baseMint`@136, `baseVault`@168, `quoteVault`@200,
 *   `baseReserve` u64@232, `quoteReserve` u64@240,
 *   protocol/partner fees@248–280, `sqrtPrice` u128@280,
 *   `activationPoint` u64@296, `poolType`@304, `isMigrated`@305,
 *   flags…, `metrics` (32B)@312… Total closes at exactly 424.
 *
 * Uninitialized rules: DLMM ⟺ both reserve vaults zero (activeId
 * 0 is likewise rejected — the bin math degrades to 1.0);
 * DBC ⟺ both accounting reserves zero. `isMigrated` is exposed as
 * data, NOT a null trigger: migrated curves still decode (the
 * reserves are post-migration leftovers — the reader prices them
 * for what they are and the aggregator decides freshness).
 * DBC reserves are curve-accounting (fee-inclusive); DLMM price is
 * bin-math spot (fee-independent). Neither pool struct carries mint
 * decimals — the reader fills them from the mint accounts.
 */

export const METEORA_DLMM_MIN_LEN = 216;
// Through `hasSwap`@370 (flags past `metrics` are read, not skipped).
export const METEORA_DBC_MIN_LEN = 371;

export interface DecodedMeteoraDlmm {
  readonly family: 'meteora-dlmm';
  readonly activeId: bigint;
  readonly binStep: number;
  readonly tokenXMint: string;
  readonly tokenYMint: string;
  readonly reserveX: string;
  readonly reserveY: string;
}

export function decodeMeteoraDlmm(
  bytes: Uint8Array,
): DecodedMeteoraDlmm | null {
  try {
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length < METEORA_DLMM_MIN_LEN ||
      !discriminatorEquals(bytes, 'LbPair')
    ) {
      return null;
    }
    const activeId = readI32(bytes, 76);
    const binStep = readU16Number(bytes, 80);
    const tokenXMint = readAddress(bytes, 88);
    const tokenYMint = readAddress(bytes, 120);
    const reserveX = readAddress(bytes, 152);
    const reserveY = readAddress(bytes, 184);
    if (
      activeId === null ||
      binStep === null ||
      tokenXMint === null ||
      tokenYMint === null ||
      reserveX === null ||
      reserveY === null
    ) {
      return null;
    }
    if (activeId === 0n) return null;
    if (binStep <= 0 || binStep > 10000) return null;
    if (isZeroAddress(bytes, 152) && isZeroAddress(bytes, 184)) {
      return null;
    }
    return {
      family: 'meteora-dlmm',
      activeId,
      binStep,
      tokenXMint,
      tokenYMint,
      reserveX,
      reserveY,
    };
  } catch {
    return null;
  }
}

export interface DecodedMeteoraDbc {
  readonly family: 'meteora-dbc';
  readonly baseMint: string;
  readonly baseVault: string;
  readonly quoteVault: string;
  readonly baseReserve: bigint;
  readonly quoteReserve: bigint;
  readonly sqrtPrice: bigint;
  readonly poolType: number;
  readonly isMigrated: boolean;
  readonly hasSwap: boolean;
}

export function decodeMeteoraDbc(bytes: Uint8Array): DecodedMeteoraDbc | null {
  try {
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length < METEORA_DBC_MIN_LEN ||
      !discriminatorEquals(bytes, 'VirtualPool')
    ) {
      return null;
    }
    const baseMint = readAddress(bytes, 136);
    const baseVault = readAddress(bytes, 168);
    const quoteVault = readAddress(bytes, 200);
    const baseReserve = readU64(bytes, 232);
    const quoteReserve = readU64(bytes, 240);
    const sqrtPrice = readU128(bytes, 280);
    const poolType = readU8Number(bytes, 304);
    const isMigrated = readU8Number(bytes, 305);
    const hasSwap = readU8Number(bytes, 370);
    if (
      baseMint === null ||
      baseVault === null ||
      quoteVault === null ||
      baseReserve === null ||
      quoteReserve === null ||
      sqrtPrice === null ||
      poolType === null ||
      isMigrated === null ||
      hasSwap === null
    ) {
      return null;
    }
    if (baseReserve === 0n && quoteReserve === 0n) return null;
    return {
      family: 'meteora-dbc',
      baseMint,
      baseVault,
      quoteVault,
      baseReserve,
      quoteReserve,
      sqrtPrice,
      poolType,
      isMigrated: isMigrated !== 0,
      hasSwap: hasSwap !== 0,
    };
  } catch {
    return null;
  }
}
