import { base64ToBytes } from './codec-utils';
import {
  decodeRaydiumAmmV4,
  decodeRaydiumClmm,
  decodeRaydiumCpmm,
  RAYDIUM_AMM_V4_LEN,
  RAYDIUM_CLMM_MIN_LEN,
  RAYDIUM_CPMM_MIN_LEN,
} from './raydium-pools.codec';
import {
  FIXTURE_AMM_B64,
  FIXTURE_CLMM_B64,
  FIXTURE_CPMM_B64,
} from './solana-mainnet.fixtures';

const fixture = (b64: string): Uint8Array => {
  const bytes = base64ToBytes(b64);
  if (bytes === null) throw new Error('fixture failed to decode');
  return bytes;
};

describe('Raydium pool decoders (Lane S, real mainnet bytes)', () => {
  it('decodes the RAY/USDC AMMv4 state byte-exact', () => {
    expect(decodeRaydiumAmmV4(fixture(FIXTURE_AMM_B64))).toEqual({
      family: 'raydium-amm-v4',
      status: 6n,
      mintDecimalsA: 6,
      mintDecimalsB: 6,
      vaultA: 'FdmKUE4UMiJYFK5ogCngHzShuVKrFXBamPWcewDr31th',
      vaultB: 'Eqrhxd7bDUCH3MepKmdVkgwazXRzY6iHhEoBpY7yAohk',
      mintA: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
      mintB: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      lpReserve: 343427802407n,
    });
  });

  it('decodes the RAY/USD1 CPMM state byte-exact', () => {
    expect(decodeRaydiumCpmm(fixture(FIXTURE_CPMM_B64))).toEqual({
      family: 'raydium-cpmm',
      mintDecimalsA: 6,
      mintDecimalsB: 6,
      vaultA: '6FEdWX6EL5eF3EPvQz75vbFfx6A2a3LeT2oqaqZ5hyRz',
      vaultB: 'AsooinDcdWY3ZzNysV5S1Hne9YatjUCem5ahHmQQgGCK',
      mintA: 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',
      mintB: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
      lpAmount: 240966850n,
      openTime: 1759193076n,
    });
  });

  it('decodes the RAY/SOL CLMM state byte-exact', () => {
    expect(decodeRaydiumClmm(fixture(FIXTURE_CLMM_B64))).toEqual({
      family: 'raydium-clmm',
      mintDecimalsA: 9,
      mintDecimalsB: 6,
      tickSpacing: 10,
      mintA: 'So11111111111111111111111111111111111111112',
      mintB: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
      vaultA: '9Jgp8NpqEDFd5d3RQPfuRY7gMgRFByTNFmi68Ph1yvVb',
      vaultB: 'Be1CFyoPAr8aBGxpvCPD2LD21hdz2vjYNq8EcypnmgGD',
      liquidity: 22022104424275n,
      sqrtPriceX64: 4491456955016210805n,
      tickCurrent: -28256n,
    });
  });

  it('reproduces the CLMM sqrt price (RAY ~$2 vs SOL $120.56)', () => {
    const decoded = decodeRaydiumClmm(fixture(FIXTURE_CLMM_B64));
    if (decoded === null) throw new Error('fixture must decode');
    const raw =
      (Number(decoded.sqrtPriceX64) / 2 ** 64) ** 2 *
      10 ** (decoded.mintDecimalsA - decoded.mintDecimalsB);
    expect(raw).toBeGreaterThan(55);
    expect(raw).toBeLessThan(65);
  });

  it('rejects cross-family input (AMM bytes into CPMM/CLMM)', () => {
    const amm = fixture(FIXTURE_AMM_B64);
    expect(decodeRaydiumCpmm(amm)).toBeNull();
    expect(decodeRaydiumClmm(amm)).toBeNull();
  });

  it('rejects truncated input at the length guards', () => {
    expect(
      decodeRaydiumAmmV4(
        fixture(FIXTURE_AMM_B64).subarray(0, RAYDIUM_AMM_V4_LEN - 1),
      ),
    ).toBeNull();
    expect(
      decodeRaydiumCpmm(
        fixture(FIXTURE_CPMM_B64).subarray(0, RAYDIUM_CPMM_MIN_LEN - 1),
      ),
    ).toBeNull();
    expect(
      decodeRaydiumClmm(
        fixture(FIXTURE_CLMM_B64).subarray(0, RAYDIUM_CLMM_MIN_LEN - 1),
      ),
    ).toBeNull();
  });

  it('rejects uninitialized states (status/openTime/liquidity zero)', () => {
    const amm = fixture(FIXTURE_AMM_B64);
    new DataView(amm.buffer, amm.byteOffset, 8).setBigUint64(0, 0n, true);
    expect(decodeRaydiumAmmV4(amm)).toBeNull();

    const cpmm = fixture(FIXTURE_CPMM_B64);
    new DataView(cpmm.buffer, cpmm.byteOffset + 373, 8).setBigUint64(
      0,
      0n,
      true,
    );
    expect(decodeRaydiumCpmm(cpmm)).toBeNull();

    const clmm = fixture(FIXTURE_CLMM_B64);
    clmm.fill(0, 237, 253);
    expect(decodeRaydiumClmm(clmm)).toBeNull();
  });
});
