import { addressToBytes } from 'launchpad/infrastructure/solana-pda';
import { base64ToBytes } from './codec-utils';
import {
  decodePumpCurve,
  PUMP_CURVE_INITIAL_REAL_TOKEN_RESERVES,
  PUMP_CURVE_MIN_LEN,
  PUMP_CURVE_PADDED_LEN,
  pumpCurveProgressPercent,
} from './pump-bonding-curve.codec';
import { FIXTURE_PUMP_CURVE_B64 } from './solana-mainnet.fixtures';
import { anchorDiscriminator } from './solana-program-ids';

const REFERENCE_MINT = '2dNdT2gD8x2BkmffjAyQe3o6hES33jg1tAgTJCRkvBTC';
const REFERENCE_QUOTE_MINT = 'HytpiyuR3sVXGB5UqoqrnThCPH2X1tWVm5neep3Dpump';
/** Creator decoded from bytes 49..81 of the live 151B fixture. */
const FIXTURE_CREATOR = '5LH1W9Qn6SYUfAf8tMLsNYU3pHgPPTkLTUQMZdP3DG3M';

const realCurve = (): Uint8Array => {
  const bytes = base64ToBytes(FIXTURE_PUMP_CURVE_B64);
  if (bytes === null) throw new Error('fixture failed to decode');
  return bytes;
};

/**
 * Synthetic CURRENT-layout (166B) curve: discriminator + reserves +
 * `complete = false` + creator + mayhem/cashback flags + quote mint +
 * fee bps. Historical layouts are prefixes of this one, so every length
 * vector below is a truncation of this same payload.
 */
function syntheticCurve(): Uint8Array {
  const raw = Buffer.alloc(PUMP_CURVE_PADDED_LEN);
  Buffer.from(anchorDiscriminator('BondingCurve')).copy(raw, 0);
  raw.writeBigUInt64LE(1_000_000_000_000n, 8); // virtual token reserves
  raw.writeBigUInt64LE(30_000_000_000n, 16); // virtual quote reserves
  raw.writeBigUInt64LE(272_126_872_931_864n, 24); // real token reserves
  raw.writeBigUInt64LE(5_000_000_000n, 32); // real quote reserves
  raw.writeBigUInt64LE(1_000_000_000_000_000n, 40); // token total supply
  raw[48] = 0; // complete
  Buffer.from(addressToBytes(FIXTURE_CREATOR)).copy(raw, 49);
  raw[81] = 0; // is_mayhem_mode
  raw[82] = 0; // is_cashback_coin
  Buffer.from(addressToBytes(REFERENCE_QUOTE_MINT)).copy(raw, 83);
  raw.writeBigUInt64LE(25n, 115); // creator_fee_bps
  return Uint8Array.from(raw);
}

describe('decodePumpCurve (Lane S, real mainnet bytes)', () => {
  it('decodes the live bonding curve byte-exact', () => {
    const decoded = decodePumpCurve(realCurve());
    expect(decoded).toEqual({
      family: 'pump',
      virtualTokenReserves: 562235733991342n,
      virtualSolReserves: 57253565516n,
      realTokenReserves: 282335733991342n,
      realSolReserves: 27253565516n,
      tokenTotalSupply: 1000000000000000n,
      complete: false,
      // Live account is 151B: both append-only fields are present and
      // `quote_mint` is the all-zero SOL-like slot.
      creator: FIXTURE_CREATOR,
      quoteMint: null,
    });
  });

  it('implies a sane SOL-per-token price (DexScreener $0.00001672 band)', () => {
    const decoded = decodePumpCurve(realCurve());
    if (decoded === null) throw new Error('fixture must decode');
    const solPerToken =
      Number(decoded.virtualSolReserves) /
      1e9 /
      (Number(decoded.virtualTokenReserves) / 1e6);
    expect(solPerToken).toBeGreaterThan(0.5e-7);
    expect(solPerToken).toBeLessThan(2e-7);
  });

  it('rejects a corrupted discriminator', () => {
    const bytes = realCurve();
    bytes[0] ^= 0xff;
    expect(decodePumpCurve(bytes)).toBeNull();
  });

  it('rejects truncated input', () => {
    expect(
      decodePumpCurve(realCurve().subarray(0, PUMP_CURVE_MIN_LEN - 1)),
    ).toBeNull();
    expect(decodePumpCurve(new Uint8Array(0))).toBeNull();
  });

  it('rejects a migrated (complete) curve', () => {
    const bytes = realCurve();
    bytes[48] = 1;
    expect(decodePumpCurve(bytes)).toBeNull();
  });

  it('rejects an all-zero reserve block', () => {
    const bytes = realCurve();
    bytes.fill(0, 8, 48);
    expect(decodePumpCurve(bytes)).toBeNull();
  });

  describe('historical length matrix (each layout is a prefix)', () => {
    const full = syntheticCurve();

    it('49B: reserves decode, creator and quoteMint stay null', () => {
      const decoded = decodePumpCurve(full.subarray(0, 49));
      expect(decoded).not.toBeNull();
      expect(decoded?.realTokenReserves).toBe(272_126_872_931_864n);
      expect(decoded?.tokenTotalSupply).toBe(1_000_000_000_000_000n);
      expect(decoded?.creator).toBeNull();
      expect(decoded?.quoteMint).toBeNull();
    });

    it('81B: creator present, quoteMint still null', () => {
      const decoded = decodePumpCurve(full.subarray(0, 81));
      expect(decoded?.creator).toBe(FIXTURE_CREATOR);
      expect(decoded?.quoteMint).toBeNull();
    });

    it('82B/83B: still below the quote_mint window', () => {
      for (const len of [82, 83]) {
        const decoded = decodePumpCurve(full.subarray(0, len));
        expect(decoded?.creator).toBe(FIXTURE_CREATOR);
        expect(decoded?.quoteMint).toBeNull();
      }
    });

    it('115B: quote_mint window opens (exactly 83 + 32)', () => {
      const decoded = decodePumpCurve(full.subarray(0, 115));
      expect(decoded?.creator).toBe(FIXTURE_CREATOR);
      expect(decoded?.quoteMint).toBe(REFERENCE_QUOTE_MINT);
    });

    it('166B: full current layout (creator + quote mint)', () => {
      const decoded = decodePumpCurve(full.subarray(0, 166));
      expect(decoded).toEqual({
        family: 'pump',
        virtualTokenReserves: 1_000_000_000_000n,
        virtualSolReserves: 30_000_000_000n,
        realTokenReserves: 272_126_872_931_864n,
        realSolReserves: 5_000_000_000n,
        tokenTotalSupply: 1_000_000_000_000_000n,
        complete: false,
        creator: FIXTURE_CREATOR,
        quoteMint: REFERENCE_QUOTE_MINT,
      });
    });

    it('zero-pads before reading (no offset can fail inside 166B)', () => {
      // 49B is the shortest accepted account: `tokenTotalSupply` (40) and
      // `complete` (48) are in range, and the padded tail reads as 0.
      const decoded = decodePumpCurve(full.subarray(0, 49));
      expect(decoded?.virtualTokenReserves).toBe(1_000_000_000_000n);
      expect(decoded?.complete).toBe(false);
    });
  });

  it('treats an all-zero quote_mint slot as SOL-like (null)', () => {
    const bytes = syntheticCurve();
    bytes.fill(0, 83, 115);
    expect(decodePumpCurve(bytes)?.quoteMint).toBeNull();
  });

  it('pins the padded length at the current 166B layout', () => {
    expect(PUMP_CURVE_PADDED_LEN).toBe(166);
    expect(PUMP_CURVE_MIN_LEN).toBe(49);
    expect(PUMP_CURVE_INITIAL_REAL_TOKEN_RESERVES).toBe(793_100_000_000_000n);
  });
});

describe('pumpCurveProgressPercent (pinneado, no se ajusta)', () => {
  const progress = (realTokenReserves: bigint): number | null =>
    pumpCurveProgressPercent({ realTokenReserves });

  it('live mainnet account: 272126872931864 base units ⇒ 65.6882', () => {
    // 100 × (793100000000000 − 272126872931864) / 793100000000000
    //   = 65.688201622511158744… ⇒ 4dp 65.6882
    expect(progress(272_126_872_931_864n)).toBe(65.6882);
  });

  it('untouched curve (0 remaining) ⇒ 100', () => {
    expect(progress(0n)).toBe(100);
  });

  it('sold out (denominator remaining) ⇒ 0', () => {
    expect(progress(793_100_000_000_000n)).toBe(0);
  });

  it('clamps below zero when reserves exceed the denominator', () => {
    expect(progress(793_100_000_000_001n)).toBe(0);
    expect(progress(900_000_000_000_000n)).toBe(0);
  });

  it('rounds to 4 decimals, never to an integer', () => {
    // Exact rational (computed independently, scratch decimal math):
    //   100 × (793100000000000 − 400000000000000) / 793100000000000
    //   = 39310000000000000 / 793100000000000
    //   = 49.56499810868742907577859034…
    //   ⇒ 4dp 49.5650 (the 5th decimal rounds the 4th up)
    expect(progress(400_000_000_000_000n)).toBe(49.565);
    // And a non-trivial 4th decimal survives (not truncated to 65.68):
    //   65.688201622511158744… ⇒ 65.6882
    expect(progress(272_126_872_931_864n)).toBe(65.6882);
  });

  it('null on a non-finite reserve (BigInt beyond Number range)', () => {
    expect(progress(10n ** 400n)).toBeNull();
  });
});
