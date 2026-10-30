import {
  addressToBytes,
  bytesToAddress,
  findProgramAddress,
  utf8Seed,
} from './solana-pda';

const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const CHALE = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';
const WSOL = 'So11111111111111111111111111111111111111112';
const METAPLEX_PROGRAM = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
const REFERENCE_MINT = '2dNdT2gD8x2BkmffjAyQe3o6hES33jg1tAgTJCRkvBTC';
const REFERENCE_QUOTE_MINT =
  'HytpiyuR3sVXGB5UqoqrnThCPH2X1tWVm5neep3Dpump';

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

  // Absolute vectors derived OUTSIDE this repo with @solana/web3.js
  // 1.98.0 (`findProgramAddressSync`). They are the only proof that the
  // hand-rolled ed25519 off-curve test uses the RIGHT constants: a wrong
  // `d` / `sqrt(-1)` still returns deterministic-looking addresses, just
  // the wrong ones (the live pump curve PDA spelled every one of them).
  describe('absolute vectors (web3.js 1.98.0 parity)', () => {
    it('pump bonding-curve PDA for the reference mint', () => {
      expect(
        findProgramAddress(
          [utf8Seed('bonding-curve'), addressToBytes(REFERENCE_MINT)],
          PUMP_PROGRAM,
        ),
      ).toEqual({
        address: '5sqQd6fn8FqNkRerAYcz2gewDd97JHe9fvGASwRqQiCC',
        nonce: 254,
      });
    });

    it('pump bonding-curve PDA for CHALE', () => {
      expect(
        findProgramAddress(
          [utf8Seed('bonding-curve'), addressToBytes(CHALE)],
          PUMP_PROGRAM,
        ),
      ).toEqual({
        address: '35oVuGayp4kgTyQNPoXKeAU4mT1ujWCRrkCTd1HevzUZ',
        nonce: 255,
      });
    });

    it('pump bonding-curve PDA for WSOL', () => {
      expect(
        findProgramAddress(
          [utf8Seed('bonding-curve'), addressToBytes(WSOL)],
          PUMP_PROGRAM,
        ),
      ).toEqual({
        address: '6PiyjiAPkp2KdZtqkyQYzVsD1Prv7t8v4TaYd8ip4YFd',
        nonce: 253,
      });
    });

    it('metaplex metadata PDA for WSOL', () => {
      expect(
        findProgramAddress(
          [
            utf8Seed('metadata'),
            addressToBytes(METAPLEX_PROGRAM),
            addressToBytes(WSOL),
          ],
          METAPLEX_PROGRAM,
        ),
      ).toEqual({
        address: '6dM4TqWyWJsbx7obrdLcviBkTafD5E8av61zfU6jq57X',
        nonce: 255,
      });
    });

    it('metaplex metadata PDA for the reference quote mint', () => {
      expect(
        findProgramAddress(
          [
            utf8Seed('metadata'),
            addressToBytes(METAPLEX_PROGRAM),
            addressToBytes(REFERENCE_QUOTE_MINT),
          ],
          METAPLEX_PROGRAM,
        ),
      ).toEqual({
        address: '2gvncxFdRKWtuz2Qz2k2fCC59pJtfoBbtQzMQNdND6sL',
        nonce: 255,
      });
    });
  });
});
