import {
  isZeroAddress,
  readAddress,
  readU64,
  readU8Number,
} from './codec-utils';
import { discriminatorEquals } from './solana-program-ids';

/**
 * SPL token-account + mint + Metaplex metadata decoders (Lane S).
 *
 * Token-2022 note (measured, not assumed): the two Token-2022 mints
 * captured 2026-10-05 decode to 410B/412B while classic SPL mints
 * are exactly 82B — the 82-byte base header is IDENTICAL
 * (`mintAuthority?` 36B + `supply` u64@36 + `decimals` u8@44 +
 * `isInitialized` u8@45 + `freezeAuthority?`), with Token-2022
 * extension TLV state appended past byte 82. These decoders read
 * the base header only (supply/decimals are extension-independent)
 * and expose `isToken2022` (length > 82 / owner check is the
 * reader's job) so callers know extension parsing was skipped.
 * Token accounts are likewise fixed 165B base (+ extensions when
 * longer); `mint`@0 + `owner`@32 + `amount` u64@64 are stable.
 */

export const TOKEN_ACCOUNT_MIN_LEN = 165;
export const MINT_ACCOUNT_MIN_LEN = 82;

export interface DecodedTokenAccount {
  readonly mint: string;
  readonly owner: string;
  readonly amount: bigint;
}

export function decodeTokenAccount(
  bytes: Uint8Array,
): DecodedTokenAccount | null {
  try {
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length < TOKEN_ACCOUNT_MIN_LEN
    ) {
      return null;
    }
    const mint = readAddress(bytes, 0);
    const owner = readAddress(bytes, 32);
    const amount = readU64(bytes, 64);
    if (mint === null || owner === null || amount === null) return null;
    return { mint, owner, amount };
  } catch {
    return null;
  }
}

export interface DecodedMintAccount {
  readonly supply: bigint;
  readonly decimals: number;
  readonly isInitialized: boolean;
  /** Length past 82B = Token-2022 extension TLV present (unparsed). */
  readonly hasExtensions: boolean;
}

export function decodeMintAccount(
  bytes: Uint8Array,
): DecodedMintAccount | null {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.length < MINT_ACCOUNT_MIN_LEN) {
      return null;
    }
    const supply = readU64(bytes, 36);
    const decimals = readU8Number(bytes, 44);
    const initialized = readU8Number(bytes, 45);
    if (supply === null || decimals === null || initialized === null) {
      return null;
    }
    if (initialized !== 1) return null;
    return {
      supply,
      decimals,
      isInitialized: true,
      hasExtensions: bytes.length > MINT_ACCOUNT_MIN_LEN,
    };
  } catch {
    return null;
  }
}

export interface DecodedMetadata {
  readonly updateAuthority: string;
  readonly mint: string;
  readonly name: string;
  readonly symbol: string;
  readonly uri: string;
  readonly sellerFeeBasisPoints: number;
}

/**
 * Metaplex Token Metadata (MetadataV1, `key == 4`) borsh prefix.
 * `expectedMint` (when given) must equal the account's mint or the
 * decode is rejected — a metadata PDA for another mint is a
 * mismatch, not metadata. Strings are length-prefixed u32 + UTF-8
 * with trailing NULs trimmed; any overrun returns `null`.
 */
export function decodeMetadata(
  bytes: Uint8Array,
  expectedMint?: string,
): DecodedMetadata | null {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.length < 70) return null;
    if (bytes[0] !== 4) return null;
    const updateAuthority = readAddress(bytes, 1);
    const mint = readAddress(bytes, 33);
    if (updateAuthority === null || mint === null) return null;
    if (expectedMint !== undefined && mint !== expectedMint) return null;
    let at = 65;
    const readString = (): string | null => {
      if (at + 4 > bytes.length) return null;
      const view = new DataView(bytes.buffer, bytes.byteOffset + at, 4);
      const len = view.getUint32(0, true);
      at += 4;
      if (len > 256 || at + len > bytes.length) return null;
      const raw = Buffer.from(bytes.subarray(at, at + len)).toString('utf8');
      at += len;
      return raw.replace(/\0+$/g, '');
    };
    const name = readString();
    const symbol = readString();
    const uri = readString();
    if (name === null || symbol === null || uri === null) return null;
    if (at + 2 > bytes.length) return null;
    const feeView = new DataView(bytes.buffer, bytes.byteOffset + at, 2);
    return {
      updateAuthority,
      mint,
      name,
      symbol,
      uri,
      sellerFeeBasisPoints: feeView.getUint16(0, true),
    };
  } catch {
    return null;
  }
}

export function isUninitializedTokenAccount(bytes: Uint8Array): boolean {
  return isZeroAddress(bytes, 0) && isZeroAddress(bytes, 32);
}

export function hasKnownDiscriminator(bytes: Uint8Array): boolean {
  return (
    discriminatorEquals(bytes, 'BondingCurve') ||
    discriminatorEquals(bytes, 'PoolState') ||
    discriminatorEquals(bytes, 'Whirlpool') ||
    discriminatorEquals(bytes, 'LbPair') ||
    discriminatorEquals(bytes, 'VirtualPool')
  );
}
