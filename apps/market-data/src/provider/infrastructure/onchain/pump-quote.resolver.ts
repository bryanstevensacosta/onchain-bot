import type {
  BatchAccountsClient,
  SolanaAccountInfoValue,
} from 'provider/infrastructure/solana-rpc/solana-rpc.types';
import {
  addressToBytes,
  findProgramAddress,
  utf8Seed,
} from 'launchpad/infrastructure/solana-pda';
import { base64ToBytes, readAddress } from './codec-utils';
import {
  METAPLEX_TOKEN_METADATA_PROGRAM,
  TOKEN_2022_PROGRAM,
  WSOL_MINT,
} from './solana-program-ids';
import { decodeMetadata } from './token-accounts.codec';

/**
 * pump.fun curve QUOTE-SYMBOL resolver (`rick-compact-card` §10.16
 * points 2-3) — the one place that turns a curve's `quote_mint` into a
 * display symbol, cached in-process.
 *
 * Order (closed, never guessed):
 * 1. `quote_mint` all-zero / WSOL ⇒ SOL-like: `{quoteMint: null,
 *    quoteSymbol: null}` with ZERO extra reads.
 * 2. Token-2022 mint (`owner === Tokenz…`) ⇒ ONE read of the quote
 *    mint and parse the TLV past the 165-byte padded base (`accountType`
 *    @165, entries `[u16 type][u16 len][value]` @166). `type 19` =
 *    TokenMetadata: `update_authority(32) + mint(32) + name(u32len) +
 *    symbol(u32len) + uri(u32len) + additional`. First non-empty symbol
 *    wins (trailing NULs stripped); malformed entries are walked past
 *    or abandoned, never thrown.
 * 3. Metaplex fallback: PDA `[b"metadata", metaplex, quoteMint]`, ONE
 *    read, `decodeMetadata(bytes, quoteMint).symbol`.
 * 4. Otherwise `quoteSymbol: null` — but `quoteMint` is STILL emitted:
 *    it is a value read on-chain, not a guess.
 *
 * CACHE (in-process, reset-on-deploy, cap 500 insertion-eviction):
 * DEFINITIVE answers only — a resolved symbol, or a `null` reached after
 * BOTH legs actually answered. A transport failure or an unreadable mint
 * account is never memoized, so the next call retries. Never throws.
 */

/** Bounded in-process cache (insertion-order eviction). */
export const PUMP_QUOTE_CACHE_CAP = 500;

/** Token-2022: `Account::LEN` padding before the extension TLV. */
export const TOKEN_2022_BASE_PADDED_LEN = 165;
/** Token-2022: `accountType` byte, then TLV entries start right after. */
export const TOKEN_2022_TLV_OFFSET = 166;
/** Token-2022 extension type for the embedded TokenMetadata. */
export const TOKEN_METADATA_EXTENSION_TYPE = 19;

export interface PumpQuoteResolution {
  /** `null` when SOL-like (all-zero or WSOL), else the base58 mint. */
  readonly quoteMint: string | null;
  readonly quoteSymbol: string | null;
}

export class PumpQuoteResolver {
  private readonly cache = new Map<string, string | null>();

  public constructor(private readonly accounts: BatchAccountsClient) {}

  public async resolve(quoteMint: string | null): Promise<PumpQuoteResolution> {
    if (quoteMint === null || quoteMint === '' || quoteMint === WSOL_MINT) {
      return { quoteMint: null, quoteSymbol: null };
    }
    try {
      if (this.cache.has(quoteMint)) {
        return { quoteMint, quoteSymbol: this.cache.get(quoteMint) ?? null };
      }
      const outcome = await this.lookup(quoteMint);
      if (outcome.definitive) this.write(quoteMint, outcome.symbol);
      return { quoteMint, quoteSymbol: outcome.symbol };
    } catch {
      return { quoteMint, quoteSymbol: null };
    }
  }

  private async lookup(
    quoteMint: string,
  ): Promise<{ symbol: string | null; definitive: boolean }> {
    let symbol: string | null = null;
    let mintAccountReadable = false;
    try {
      const fetched = await this.accounts.getMultiple([quoteMint]);
      const raw: SolanaAccountInfoValue | null = fetched[0] ?? null;
      if (raw !== null) {
        const bytes = base64ToBytes(raw.data[0]);
        if (bytes !== null) {
          mintAccountReadable = true;
          if (raw.owner === TOKEN_2022_PROGRAM) {
            symbol = readToken2022Symbol(bytes, quoteMint);
          }
        }
      }
    } catch {
      // Transport failure: keep walking, never throw (and never cache).
    }
    if (symbol !== null) return { symbol, definitive: true };

    let metadataAnswered = false;
    try {
      const pda = findProgramAddress(
        [
          utf8Seed('metadata'),
          addressToBytes(METAPLEX_TOKEN_METADATA_PROGRAM),
          addressToBytes(quoteMint),
        ],
        METAPLEX_TOKEN_METADATA_PROGRAM,
      ).address;
      const fetched = await this.accounts.getMultiple([pda]);
      const raw: SolanaAccountInfoValue | null = fetched[0] ?? null;
      // An ABSENT metadata account is a definitive answer.
      metadataAnswered = true;
      if (raw !== null) {
        const bytes = base64ToBytes(raw.data[0]);
        if (bytes !== null) {
          symbol = cleanSymbol(
            decodeMetadata(bytes, quoteMint)?.symbol ?? null,
          );
        }
      }
    } catch {
      // Transport failure / invalid input: not definitive, never throws.
    }
    return { symbol, definitive: mintAccountReadable && metadataAnswered };
  }

  private write(quoteMint: string, symbol: string | null): void {
    if (this.cache.size >= PUMP_QUOTE_CACHE_CAP) {
      const oldest = this.cache.keys().next();
      if (!oldest.done) this.cache.delete(oldest.value);
    }
    this.cache.set(quoteMint, symbol);
  }
}

/**
 * Walk Token-2022 extensions looking for the first non-empty
 * TokenMetadata symbol. Bounds-checked at every step; a malformed entry
 * stops the walk (the Metaplex leg still runs).
 */
export function readToken2022Symbol(
  bytes: Uint8Array,
  expectedMint: string,
): string | null {
  if (bytes.length <= TOKEN_2022_TLV_OFFSET) return null;
  let at = TOKEN_2022_TLV_OFFSET;
  while (at + 4 <= bytes.length) {
    const type = readU16Le(bytes, at);
    const len = readU16Le(bytes, at + 2);
    if (type === null || len === null) return null;
    const valueAt = at + 4;
    if (valueAt + len > bytes.length) return null;
    if (type === TOKEN_METADATA_EXTENSION_TYPE) {
      const symbol = readTokenMetadataExtensionSymbol(
        bytes,
        valueAt,
        valueAt + len,
        expectedMint,
      );
      if (symbol !== null) return symbol;
    }
    at = valueAt + len;
  }
  return null;
}

/**
 * Token-2022 TokenMetadata value:
 * `update_authority(32) + mint(32) + name(u32len) + symbol(u32len) +
 * uri(u32len) + additional_metadata`. Only `symbol` is read; the
 * embedded mint must match the quote mint or the entry is ignored.
 */
function readTokenMetadataExtensionSymbol(
  bytes: Uint8Array,
  at: number,
  end: number,
  expectedMint: string,
): string | null {
  if (at + 64 > end) return null;
  const embeddedMint = readAddress(bytes, at + 32);
  if (embeddedMint !== null && embeddedMint !== expectedMint) return null;
  let cursor = at + 64;
  const name = readLengthPrefixedString(bytes, cursor, end);
  if (name === null) return null;
  cursor = name.next;
  const symbol = readLengthPrefixedString(bytes, cursor, end);
  if (symbol === null) return null;
  return cleanSymbol(symbol.value);
}

function readLengthPrefixedString(
  bytes: Uint8Array,
  at: number,
  end: number,
): { value: string; next: number } | null {
  if (at + 4 > end) return null;
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset + at, 4);
    const len = view.getUint32(0, true);
    const start = at + 4;
    if (len > 512 || start + len > end) return null;
    return {
      value: Buffer.from(bytes.subarray(start, start + len)).toString('utf8'),
      next: start + len,
    };
  } catch {
    return null;
  }
}

function readU16Le(bytes: Uint8Array, at: number): number | null {
  if (at < 0 || at + 2 > bytes.length) return null;
  try {
    return new DataView(bytes.buffer, bytes.byteOffset + at, 2).getUint16(
      0,
      true,
    );
  } catch {
    return null;
  }
}

function cleanSymbol(value: string | null): string | null {
  if (value === null) return null;
  const cleaned = value.replace(/\0+$/g, '');
  return cleaned === '' ? null : cleaned;
}
