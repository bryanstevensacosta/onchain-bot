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
  /**
   * Metaplex `is_mutable` flag (dexter plan todo 39, identity
   * provenance leg). A mutable metadata account still resolves
   * identity — but the provenance marker is then MANDATORY (a
   * mutable name is never rendered as a verified fact; Believe
   * rule). Decoded from the two bytes after the creators Option
   * (`primary_sale_happened`, `is_mutable` — field order per
   * `mpl-token-metadata/state/metadata.rs`; `collection`/`uses`
   * append AFTER, so they are never read here).
   */
  readonly isMutable: boolean;
}

/**
 * Metaplex Token Metadata (MetadataV1, `key == 4`) borsh prefix.
 * `expectedMint` (when given) must equal the account's mint or the
 * decode is rejected — a metadata PDA for another mint is a
 * mismatch, not metadata. Strings are length-prefixed u32 + UTF-8
 * with trailing NULs trimmed; any overrun returns `null`. The
 * creators Option is skipped (only its length matters to reach the
 * flags); a truncated tail (no `primary_sale_happened`/`is_mutable`
 * bytes) is corrupt input and returns `null`.
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
    const sellerFeeBasisPoints = feeView.getUint16(0, true);
    at += 2;
    // Creators Option<Vec<Creator>>: flag + (len u32 + n * 34B
    // entries of address 32 + verified 1 + share 1). Skipped — only
    // its span matters to reach the trailing flags.
    if (at + 1 > bytes.length) return null;
    const creatorsFlag = bytes[at];
    at += 1;
    if (creatorsFlag === 1) {
      if (at + 4 > bytes.length) return null;
      const creatorLen = new DataView(
        bytes.buffer,
        bytes.byteOffset + at,
        4,
      ).getUint32(0, true);
      at += 4;
      if (creatorLen > 16 || at + creatorLen * 34 > bytes.length) return null;
      at += creatorLen * 34;
    } else if (creatorsFlag !== 0) {
      return null;
    }
    // `primary_sale_happened` (ignored) + `is_mutable` (pinned).
    if (at + 2 > bytes.length) return null;
    const mutableFlag = bytes[at + 1];
    if (mutableFlag !== 0 && mutableFlag !== 1) return null;
    return {
      updateAuthority,
      mint,
      name,
      symbol,
      uri,
      sellerFeeBasisPoints,
      isMutable: mutableFlag === 1,
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
