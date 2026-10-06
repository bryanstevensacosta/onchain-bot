import { base64ToBytes } from './codec-utils';
import {
  decodeOrcaWhirlpool,
  ORCA_WHIRLPOOL_MIN_LEN,
} from './orca-whirlpool.codec';
import { FIXTURE_WHIRL_B64 } from './solana-mainnet.fixtures';

const realPool = (): Uint8Array => {
  const bytes = base64ToBytes(FIXTURE_WHIRL_B64);
  if (bytes === null) throw new Error('fixture failed to decode');
  return bytes;
};

describe('decodeOrcaWhirlpool (Lane S, real mainnet bytes)', () => {
  it('decodes the SOL/USDC whirlpool byte-exact', () => {
    const decoded = decodeOrcaWhirlpool(realPool());
    expect(decoded?.family).toBe('orca-whirlpool');
    expect(decoded?.tickSpacing).toBe(4);
    expect(decoded?.feeRate).toBe(400);
    expect(decoded?.mintA).toBe('So11111111111111111111111111111111111111112');
    expect(decoded?.mintB).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(decoded?.vaultA).toBe(
      'EUuUbDcafPrmVTD5M6qoJAoyyNbihBhugADAxRMn5he9',
    );
    expect(decoded?.vaultB).toBe(
      '2WLWEuKDgkDUccTpbwYp1GToYktiSB1cXvreHUwiSUVP',
    );
    expect(decoded?.liquidity).toBe(1040326585910643n);
    expect(decoded?.tickCurrentIndex).toBe(-21157n);
    expect(decoded?.mintDecimalsA).toBeNull();
    expect(decoded?.mintDecimalsB).toBeNull();
  });

  it('reproduces the DexScreener price to 5 decimals', () => {
    const decoded = decodeOrcaWhirlpool(realPool());
    if (decoded === null) throw new Error('fixture must decode');
    const raw = (Number(decoded.sqrtPriceX64) / 2 ** 64) ** 2;
    expect(raw).toBeCloseTo(0.12056, 5);
  });

  it('rejects a corrupted discriminator', () => {
    const bytes = realPool();
    bytes[3] ^= 0xff;
    expect(decodeOrcaWhirlpool(bytes)).toBeNull();
  });

  it('rejects truncated input', () => {
    expect(
      decodeOrcaWhirlpool(realPool().subarray(0, ORCA_WHIRLPOOL_MIN_LEN - 1)),
    ).toBeNull();
  });

  it('rejects a zero-liquidity (uninitialized) pool', () => {
    const bytes = realPool();
    bytes.fill(0, 49, 65);
    expect(decodeOrcaWhirlpool(bytes)).toBeNull();
  });
});
