import { readU64, readU8Number } from './codec-utils';
import { discriminatorEquals } from './solana-program-ids';

/**
 * pump.fun bonding-curve decoder (Lane S, dexter plan todo 22).
 *
 * Layout (verified against a live 151B mainnet account 2026-10-05;
 * the account has grown past the classic 49B — creator + padding
 * now trail the `complete` flag, so only the documented prefix is
 * read and the tail is ignored for forward-compatibility):
 * discriminator 8B (`account:BondingCurve`) + virtualTokenReserves
 * u64@8 + virtualSolReserves u64@16 + realTokenReserves u64@24 +
 * realSolReserves u64@32 + tokenTotalSupply u64@40 + complete u8@48.
 *
 * Price (SOL per token, human): `virtualSolReserves / 1e9 /
 * (virtualTokenReserves / 10^decimals)` — the reader applies mint
 * decimals from `getTokenSupply`. Reserves are BigInt end-to-end.
 */

export const PUMP_CURVE_MIN_LEN = 49;

export interface DecodedPumpCurve {
  readonly family: 'pump';
  readonly virtualTokenReserves: bigint;
  readonly virtualSolReserves: bigint;
  readonly realTokenReserves: bigint;
  readonly realSolReserves: bigint;
  readonly tokenTotalSupply: bigint;
  readonly complete: boolean;
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
    const virtualTokenReserves = readU64(bytes, 8);
    const virtualSolReserves = readU64(bytes, 16);
    const realTokenReserves = readU64(bytes, 24);
    const realSolReserves = readU64(bytes, 32);
    const tokenTotalSupply = readU64(bytes, 40);
    const complete = readU8Number(bytes, 48);
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
    return {
      family: 'pump',
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply,
      complete: false,
    };
  } catch {
    return null;
  }
}
