import {
  decodeAddressReturn,
  decodeDecimalsReturn,
  decodeUint128Return,
  decodeUint256Return,
  decodeV2Reserves,
  decodeV3FeeReturn,
  decodeV3Slot0,
  decodeV4Slot0,
  encodeBytes32ArgCall,
  encodeNoArgCall,
  sqrtPriceX96ToPrice1Per0,
  v2ReservesToPrice1Per0,
  v4StateViewForChain,
  ERC20_DECIMALS_SELECTOR,
  V2_GET_RESERVES_SELECTOR,
  V2_TOKEN0_SELECTOR,
  V3_LIQUIDITY_SELECTOR,
  V3_SLOT0_SELECTOR,
  V4_GET_LIQUIDITY_SELECTOR,
  V4_GET_SLOT0_SELECTOR,
  V4_LENS_UNVERIFIED_REASON,
} from './evm-pools.codec';

/**
 * LIVE fixture (captured 2026-10-05, ONE probe — see codec header):
 * DexScreener `GET /latest/dex/tokens/0xC02a...` (WETH) filtered to
 * chainId=ethereum + dexId=uniswap + labels=[v2] discovered pair
 * `0xB4e16d0168e52d35CaCD2c6185b44281Ec28C9Dc` (WETH/USDC, DexScreener
 * liquidity ~$21,087,241). ONE `eth_call` to Multicall3
 * `0xcA11bde05977b3631167028862bE2a173976CA11` via
 * `https://ethereum-rpc.publicnode.com` with
 * `encodeTryAggregate([{ target: pair, callData: '0x0902f1ac' }])`
 * returned success=true. Full 288-byte aggregate return below; the
 * decoders in this file consume the INNER 96-byte `getReserves`
 * returnData (last element), pinned as `LIVE_V2_RESERVES_RETURN`.
 */
const LIVE_V2_TRYAGGREGATE_RETURN =
  '0x0000000000000000000000000000000000000000000000000000000000000020' +
  '0000000000000000000000000000000000000000000000000000000000000001' +
  '0000000000000000000000000000000000000000000000000000000000000020' +
  '0000000000000000000000000000000000000000000000000000000000000001' +
  '0000000000000000000000000000000000000000000000000000000000000040' +
  '0000000000000000000000000000000000000000000000000000000000000060' +
  '00000000000000000000000000000000000000000000000000000996e0c49822' +
  '0000000000000000000000000000000000000000000000d264188254ac09ac64' +
  '000000000000000000000000000000000000000000000000000000006ac3a25b';

const LIVE_V2_RESERVES_RETURN =
  '0x00000000000000000000000000000000000000000000000000000996e0c49822' +
  '0000000000000000000000000000000000000000000000d264188254ac09ac64' +
  '000000000000000000000000000000000000000000000000000000006ac3a25b';

const word = (value: bigint): string =>
  `0x${value.toString(16).padStart(64, '0')}`;

const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDC_WORD = `0x000000000000000000000000${USDC.slice(2).toLowerCase()}`;

describe('evm pools codec (selectors derived 2026-10-05)', () => {
  it('pins the derived selectors (memory cross-checked, liquidity corrected)', () => {
    expect(V2_GET_RESERVES_SELECTOR).toBe('0x0902f1ac');
    expect(V2_TOKEN0_SELECTOR).toBe('0x0dfe1681');
    expect(ERC20_DECIMALS_SELECTOR).toBe('0x313ce567');
    expect(V3_SLOT0_SELECTOR).toBe('0x3850c7bd');
    // Memory said 0x1a686774 — derivation proved 0x1a686502.
    expect(V3_LIQUIDITY_SELECTOR).toBe('0x1a686502');
    expect(V4_GET_SLOT0_SELECTOR).toBe('0xc815641c');
    expect(V4_GET_LIQUIDITY_SELECTOR).toBe('0xfa6793d5');
  });

  it('decodes the LIVE getReserves response (aggregate shape intact)', () => {
    expect(LIVE_V2_TRYAGGREGATE_RETURN.length).toBe(2 + 288 * 2);
    const decoded = decodeV2Reserves(LIVE_V2_RESERVES_RETURN);
    expect(decoded).toEqual({
      reserve0: 10543620724770n,
      reserve1: 3881028913582414867556n,
      blockTimestampLast: 1791205979,
    });
  });

  it('live reserves are plausible (USDC leg ~10.54M, WETH leg ~3881)', () => {
    const decoded = decodeV2Reserves(LIVE_V2_RESERVES_RETURN);
    if (decoded === null) throw new Error('live fixture failed to decode');
    // token0 = USDC (6dp), token1 = WETH (18dp) — leg order pinned.
    expect(Number(decoded.reserve0) / 1e6).toBeCloseTo(10543620.7, 1);
    expect(Number(decoded.reserve1) / 1e18).toBeCloseTo(3881.03, 2);
    const price = v2ReservesToPrice1Per0(
      decoded.reserve0,
      decoded.reserve1,
      6,
      18,
    );
    // Plausible ETH band, NOT a parity pin (price moves; reserves do not).
    expect(price).not.toBeNull();
    expect(price as number).toBeGreaterThan(1000);
    expect(price as number).toBeLessThan(5000);
  });

  it('decodes token addresses (zero-prefix enforced)', () => {
    expect(decodeAddressReturn(USDC_WORD)).toBe(USDC.toLowerCase());
    expect(
      decodeAddressReturn(
        '0x110000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      ),
    ).toBeNull();
    expect(decodeAddressReturn('0x1234')).toBeNull();
  });

  it('decodes decimals strictly (uint8 range)', () => {
    expect(decodeDecimalsReturn(word(6n))).toBe(6);
    expect(decodeDecimalsReturn(word(18n))).toBe(18);
    expect(decodeDecimalsReturn(word(256n))).toBeNull();
    expect(decodeDecimalsReturn('0x1234')).toBeNull();
  });

  it('decodes uint256/uint128 words', () => {
    expect(decodeUint256Return(word(2n ** 200n))).toBe(2n ** 200n);
    expect(decodeUint128Return(word(2n ** 128n - 1n))).toBe(2n ** 128n - 1n);
    expect(decodeUint256Return('0x')).toBeNull();
  });

  it('decodes V3 slot0 at parity (synthetic, sqrtPrice = 2^96)', () => {
    const slot0 = `0x${(2n ** 96n).toString(16).padStart(64, '0')}${'0'.repeat(64)}`;
    const decoded = decodeV3Slot0(slot0);
    expect(decoded).toEqual({ sqrtPriceX96: 2n ** 96n, tick: 0 });
    expect(sqrtPriceX96ToPrice1Per0(2n ** 96n, 18, 18)).toBe(1);
  });

  it('rejects uninitialized V3 pools (sqrtPriceX96 == 0)', () => {
    expect(decodeV3Slot0(`0x${'0'.repeat(128)}`)).toBeNull();
    expect(decodeV3Slot0('0x1234')).toBeNull();
  });

  it('decodes V3 fee in hundredths of a bps', () => {
    expect(decodeV3FeeReturn(word(3000n))).toBe(3000);
    expect(decodeV3FeeReturn(word(2n ** 24n))).toBeNull();
  });

  it('decodes V4 slot0 incl. negative ticks (synthetic)', () => {
    const tickNeg100 = ((1n << 24n) - 100n).toString(16).padStart(64, '0');
    const slot0 =
      `0x${(2n ** 96n).toString(16).padStart(64, '0')}` +
      `0x${tickNeg100}`.slice(2) +
      `${'0'.repeat(64)}${word(500n).slice(2)}`;
    const decoded = decodeV4Slot0(slot0);
    expect(decoded).toEqual({
      sqrtPriceX96: 2n ** 96n,
      tick: -100,
      protocolFee: 0,
      lpFee: 500,
    });
  });

  it('rejects uninitialized V4 pools (sqrtPriceX96 == 0)', () => {
    expect(decodeV4Slot0(`0x${'0'.repeat(256)}`)).toBeNull();
  });

  it('encodes no-arg and bytes32-arg calls', () => {
    expect(encodeNoArgCall('0902f1ac')).toBe('0x0902f1ac');
    expect(encodeNoArgCall(V2_GET_RESERVES_SELECTOR)).toBe('0x0902f1ac');
    const poolId = `0x${'ab'.repeat(32)}`;
    expect(encodeBytes32ArgCall(V4_GET_SLOT0_SELECTOR, poolId)).toBe(
      `0xc815641c${'ab'.repeat(32)}`,
    );
    expect(encodeBytes32ArgCall(V4_GET_SLOT0_SELECTOR, '0x1234')).toBeNull();
  });

  it('resolves the V4 lens table (ethereum+base verified, rest unsupported)', () => {
    expect(v4StateViewForChain('ethereum')).toBe(
      '0x7ffe42c4a5deea5b0fec41c94c136cf115597227',
    );
    expect(v4StateViewForChain('base')).toBe(
      '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
    );
    for (const chain of [
      'bsc',
      'arbitrum',
      'polygon',
      'optimism',
      'unichain',
      'robinhood',
      'solana',
    ]) {
      expect(v4StateViewForChain(chain)).toBeNull();
    }
    expect(V4_LENS_UNVERIFIED_REASON).toBe('v4-lens-unverified');
  });

  it('price math guards (zero/negative/short all null)', () => {
    expect(v2ReservesToPrice1Per0(0n, 100n, 6, 18)).toBeNull();
    expect(v2ReservesToPrice1Per0(100n, 0n, 6, 18)).toBeNull();
    expect(sqrtPriceX96ToPrice1Per0(0n, 6, 6)).toBeNull();
  });
});
