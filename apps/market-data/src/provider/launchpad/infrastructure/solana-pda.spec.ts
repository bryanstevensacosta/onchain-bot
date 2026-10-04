import {
  addressToBytes,
  bytesToAddress,
  findProgramAddress,
  utf8Seed,
} from './solana-pda';

const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const CHALE = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';
const WSOL = 'So11111111111111111111111111111111111111112';

describe('solana-pda (zero-dep findProgramAddress)', () => {
  it('round-trips base58 decode/encode on a known mint', () => {
    const bytes = addressToBytes(CHALE);
    expect(bytes).toHaveLength(32);
    expect(bytesToAddress(bytes)).toBe(CHALE);
  });

  it('rejects invalid base58 input', () => {
    expect(() => addressToBytes('0OIl nope')).toThrow();
  });

  it('rejects seeds longer than 32 bytes', () => {
    expect(() =>
      findProgramAddress(
        [utf8Seed('bonding-curve-0123456789abcdef0123456789x')],
        PUMP_PROGRAM,
      ),
    ).toThrow();
  });

  it('is deterministic for the same inputs', () => {
    const mint = addressToBytes(CHALE);
    const first = findProgramAddress(
      [utf8Seed('bonding-curve'), mint],
      PUMP_PROGRAM,
    );
    const second = findProgramAddress(
      [utf8Seed('bonding-curve'), mint],
      PUMP_PROGRAM,
    );
    expect(second).toEqual(first);
    expect(first.nonce).toBeGreaterThanOrEqual(0);
    expect(first.nonce).toBeLessThanOrEqual(255);
  });

  it('separates seeds, mints, and programs (no collisions)', () => {
    const mint = addressToBytes(CHALE);
    const pump = findProgramAddress(
      [utf8Seed('bonding-curve'), mint],
      PUMP_PROGRAM,
    ).address;
    const otherSeed = findProgramAddress(
      [utf8Seed('bonding-curve!'), mint],
      PUMP_PROGRAM,
    ).address;
    const otherMint = findProgramAddress(
      [utf8Seed('bonding-curve'), addressToBytes(WSOL)],
      PUMP_PROGRAM,
    ).address;
    expect(new Set([pump, otherSeed, otherMint]).size).toBe(3);
  });

  it('base58 preserves leading-zero bytes (leading ones)', () => {
    const zeros = '1'.repeat(32);
    expect(bytesToAddress(addressToBytes(zeros))).toBe(zeros);
  });
});
