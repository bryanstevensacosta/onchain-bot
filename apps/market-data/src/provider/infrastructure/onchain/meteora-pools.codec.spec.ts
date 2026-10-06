import { base64ToBytes } from './codec-utils';
import {
  decodeMeteoraDbc,
  decodeMeteoraDlmm,
  METEORA_DBC_MIN_LEN,
  METEORA_DLMM_MIN_LEN,
} from './meteora-pools.codec';
import { FIXTURE_DBC_B64, FIXTURE_DLMM_B64 } from './solana-mainnet.fixtures';

const fixture = (b64: string): Uint8Array => {
  const bytes = base64ToBytes(b64);
  if (bytes === null) throw new Error('fixture failed to decode');
  return bytes;
};

describe('Meteora pool decoders (Lane S, real mainnet bytes)', () => {
  it('decodes the RAY/SOL DLMM LbPair byte-exact', () => {
    expect(decodeMeteoraDlmm(fixture(FIXTURE_DLMM_B64))).toEqual({
      family: 'meteora-dlmm',
      activeId: 1133n,
      binStep: 25,
      tokenXMint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
      tokenYMint: 'So11111111111111111111111111111111111111112',
      reserveX: '4M9ZPiwchfT96Yiqah5dFYq6Skn6b9YG8qsg4uZNFTQM',
      reserveY: 'FaGEGz7fQKZXCb5W76r93VjwyXuyFdU8Zzd2fizCz1i9',
    });
  });

  it('reproduces the DLMM bin-math price (RAY ~$2 vs SOL $120.56)', () => {
    const decoded = decodeMeteoraDlmm(fixture(FIXTURE_DLMM_B64));
    if (decoded === null) throw new Error('fixture must decode');
    const spot =
      Math.pow(1 + decoded.binStep / 10000, Number(decoded.activeId)) *
      10 ** (6 - 9);
    expect(spot).toBeGreaterThan(0.015);
    expect(spot).toBeLessThan(0.019);
  });

  it('decodes the BACKERS/SOL DBC VirtualPool byte-exact', () => {
    expect(decodeMeteoraDbc(fixture(FIXTURE_DBC_B64))).toEqual({
      family: 'meteora-dbc',
      baseMint: 'CwHcDBVa35b37yyPs29Z2r2yU9Wxy7TNJtKe9mUWhSNh',
      baseVault: '4S5gufKJEsxtkb4kicRSyYM2LEr3CxjmggdULNifq75B',
      quoteVault: 'B4kEVhvYHwvTShGazJMzN2Cy2Ydag5zvyPoHct2fCRmq',
      baseReserve: 799000030094747n,
      quoteReserve: 10000n,
      sqrtPrice: 583337266871351588n,
      poolType: 1,
      isMigrated: true,
      hasSwap: true,
    });
  });

  it('rejects cross-family input (DLMM bytes into DBC and reverse)', () => {
    expect(decodeMeteoraDbc(fixture(FIXTURE_DLMM_B64))).toBeNull();
    expect(decodeMeteoraDlmm(fixture(FIXTURE_DBC_B64))).toBeNull();
  });

  it('rejects truncated input at the length guards', () => {
    expect(
      decodeMeteoraDlmm(
        fixture(FIXTURE_DLMM_B64).subarray(0, METEORA_DLMM_MIN_LEN - 1),
      ),
    ).toBeNull();
    expect(
      decodeMeteoraDbc(
        fixture(FIXTURE_DBC_B64).subarray(0, METEORA_DBC_MIN_LEN - 1),
      ),
    ).toBeNull();
  });

  it('rejects uninitialized states (zero activeId / zero reserves)', () => {
    const dlmm = fixture(FIXTURE_DLMM_B64);
    new DataView(dlmm.buffer, dlmm.byteOffset + 76, 4).setInt32(0, 0, true);
    expect(decodeMeteoraDlmm(dlmm)).toBeNull();

    const dbc = fixture(FIXTURE_DBC_B64);
    dbc.fill(0, 232, 248);
    expect(decodeMeteoraDbc(dbc)).toBeNull();
  });
});
