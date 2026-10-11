import { addressToBytes } from 'launchpad/infrastructure/solana-pda';
import { base64ToBytes } from './codec-utils';
import {
  decodeMetadata,
  decodeMintAccount,
  decodeTokenAccount,
  MINT_ACCOUNT_MIN_LEN,
  TOKEN_ACCOUNT_MIN_LEN,
} from './token-accounts.codec';
import {
  FIXTURE_CLMM_VAULT_B64,
  FIXTURE_T22_PUMP_MINT_B64,
  FIXTURE_USDC_META_B64,
  FIXTURE_USD1_MINT_B64,
} from './solana-mainnet.fixtures';

const T22_MINT = '6HD1iyTY4ChvoFEKgQ2tV4rHavrpR1yJw9Kwyqtm7hmC';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

const fixture = (b64: string): Uint8Array => {
  const bytes = base64ToBytes(b64);
  if (bytes === null) throw new Error('fixture failed to decode');
  return bytes;
};

/**
 * Synthetic Metaplex metadata writer (todo 39 isMutable pins):
 * mirrors the decode layout (key 4, updateAuthority, mint, 3
 * length-prefixed strings, fee u16, creators Option, primary u8,
 * mutable u8). Used for the immutable + creators-present shapes no
 * live fixture covers.
 */
const buildMetadata = (args: {
  readonly mint: string;
  readonly name: string;
  readonly symbol: string;
  readonly uri: string;
  readonly creators: ReadonlyArray<string>;
  readonly primarySaleHappened: boolean;
  readonly isMutable: boolean;
}): Uint8Array => {
  const out: number[] = [4];
  const mintBytes = addressToBytes(args.mint);
  out.push(...mintBytes, ...mintBytes);
  const pushString = (value: string): void => {
    const raw = Buffer.from(value, 'utf8');
    const len = Buffer.alloc(4);
    len.writeUInt32LE(raw.length, 0);
    out.push(...len, ...raw);
  };
  pushString(args.name);
  pushString(args.symbol);
  pushString(args.uri);
  out.push(0, 0);
  if (args.creators.length === 0) {
    out.push(0);
  } else {
    out.push(1);
    const len = Buffer.alloc(4);
    len.writeUInt32LE(args.creators.length, 0);
    out.push(...len);
    for (const creator of args.creators) {
      out.push(...addressToBytes(creator), 1, 5);
    }
  }
  out.push(args.primarySaleHappened ? 1 : 0, args.isMutable ? 1 : 0);
  return Uint8Array.from(out);
};

describe('token account / mint / metadata decoders (real mainnet bytes)', () => {
  it('decodes a classic SPL mint (USD1, 82B exact, no extensions)', () => {
    const decoded = decodeMintAccount(fixture(FIXTURE_USD1_MINT_B64));
    expect(decoded).toEqual({
      supply: 1399640572894522n,
      decimals: 6,
      isInitialized: true,
      hasExtensions: false,
    });
  });

  it('decodes a Token-2022 mint base header (extensions flagged, not parsed)', () => {
    const decoded = decodeMintAccount(fixture(FIXTURE_T22_PUMP_MINT_B64));
    expect(decoded).toEqual({
      supply: 999994311646250n,
      decimals: 6,
      isInitialized: true,
      hasExtensions: true,
    });
  });

  it('decodes a live vault token account (CLMM WSOL leg, pool-owned)', () => {
    const decoded = decodeTokenAccount(fixture(FIXTURE_CLMM_VAULT_B64));
    expect(decoded?.mint).toBe('So11111111111111111111111111111111111111112');
    expect(decoded?.owner).toBe('2AXXcN6oN9bBT5owwmTH53C7QHUXvhLeu718Kqt8rvY2');
    expect(decoded?.amount).toBe(15005938975394n);
  });

  it('decodes the USDC Metaplex metadata (name/symbol, empty uri)', () => {
    const decoded = decodeMetadata(fixture(FIXTURE_USDC_META_B64), USDC_MINT);
    expect(decoded?.mint).toBe(USDC_MINT);
    expect(decoded?.name).toBe('USD Coin');
    expect(decoded?.symbol).toBe('USDC');
    expect(decoded?.uri).toBe('');
  });

  it('decodes isMutable from live USDC bytes (mutable, no creators)', () => {
    const decoded = decodeMetadata(fixture(FIXTURE_USDC_META_B64), USDC_MINT);
    expect(decoded?.isMutable).toBe(true);
  });

  it('decodes isMutable=false past a creators vec (immutable mint)', () => {
    const bytes = buildMetadata({
      mint: T22_MINT,
      name: 'Locked',
      symbol: 'LOCK',
      uri: '',
      creators: [T22_MINT],
      primarySaleHappened: true,
      isMutable: false,
    });
    const decoded = decodeMetadata(bytes, T22_MINT);
    expect(decoded?.name).toBe('Locked');
    expect(decoded?.symbol).toBe('LOCK');
    expect(decoded?.sellerFeeBasisPoints).toBe(0);
    expect(decoded?.isMutable).toBe(false);
  });

  it('rejects metadata truncated before the mutable flags (corrupt tail)', () => {
    const full = buildMetadata({
      mint: T22_MINT,
      name: 'Short',
      symbol: 'SH',
      uri: '',
      creators: [],
      primarySaleHappened: false,
      isMutable: true,
    });
    // Cut inside the creators flag / flag bytes: name/symbol/fee are
    // intact but the provenance flags are unreadable -> null.
    expect(
      decodeMetadata(full.subarray(0, full.length - 1), T22_MINT),
    ).toBeNull();
    expect(
      decodeMetadata(full.subarray(0, full.length - 2), T22_MINT),
    ).toBeNull();
  });

  it('rejects metadata for the wrong mint', () => {
    expect(decodeMetadata(fixture(FIXTURE_USDC_META_B64), T22_MINT)).toBeNull();
  });

  it('rejects truncated mint / token / metadata input', () => {
    expect(
      decodeMintAccount(
        fixture(FIXTURE_T22_PUMP_MINT_B64).subarray(
          0,
          MINT_ACCOUNT_MIN_LEN - 1,
        ),
      ),
    ).toBeNull();
    expect(
      decodeTokenAccount(new Uint8Array(TOKEN_ACCOUNT_MIN_LEN - 1)),
    ).toBeNull();
    expect(
      decodeMetadata(fixture(FIXTURE_USDC_META_B64).subarray(0, 69)),
    ).toBeNull();
  });

  it('rejects non-metadata accounts (wrong key byte)', () => {
    const bytes = fixture(FIXTURE_USDC_META_B64);
    bytes[0] = 3;
    expect(decodeMetadata(bytes, USDC_MINT)).toBeNull();
  });
});
