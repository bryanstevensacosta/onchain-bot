import { base64ToBytes } from './codec-utils';
import {
  decodePumpCurve,
  PUMP_CURVE_MIN_LEN,
} from './pump-bonding-curve.codec';
import { FIXTURE_PUMP_CURVE_B64 } from './solana-mainnet.fixtures';

const realCurve = (): Uint8Array => {
  const bytes = base64ToBytes(FIXTURE_PUMP_CURVE_B64);
  if (bytes === null) throw new Error('fixture failed to decode');
  return bytes;
};

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
});
