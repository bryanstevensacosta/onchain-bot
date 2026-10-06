import type { ChainRpc } from 'provider/infrastructure/alchemy/alchemy.chains';
import type {
  MulticallCall,
  MulticallClient,
  MulticallResult,
} from 'provider/infrastructure/alchemy/multicall.service';
import { OnchainEvmReaderService } from './onchain-evm.reader';

const word = (value: bigint): string =>
  `0x${value.toString(16).padStart(64, '0')}`;

const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const WETH = '0xc02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'.toLowerCase();
const addrWord = (address: string): string =>
  `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}`;

const ok = (value: string): MulticallResult => ({ ok: true, value });
const miss: MulticallResult = { ok: false, value: null };

const PAIR = '0x1111111111111111111111111111111111111111';
const POOL = '0x2222222222222222222222222222222222222222';
const POOL_ID = `0x${'ab'.repeat(32)}`;

const reservesReturn = (r0: bigint, r1: bigint, ts: number): string =>
  `0x${r0.toString(16).padStart(64, '0')}${r1
    .toString(16)
    .padStart(64, '0')}${BigInt(ts).toString(16).padStart(64, '0')}`;

/** Queued `ok` payloads, one tryAggregate batch per entry. */
const mockMulticall = (
  batches: ReadonlyArray<ReadonlyArray<MulticallResult>>,
): MulticallClient & { readonly calls: MulticallCall[][] } => {
  const calls: MulticallCall[][] = [];
  let n = 0;
  return {
    calls,
    tryAggregate: async (
      _chain: string,
      inner: ReadonlyArray<MulticallCall>,
    ): Promise<ReadonlyArray<MulticallResult>> => {
      calls.push([...inner]);
      const batch = batches[n] ?? [];
      n += 1;
      return inner.map((_, i) => batch[i] ?? miss);
    },
  };
};

const mockChainRpc = (code: string | null): ChainRpc => ({
  getCode: async () => code,
  getTransactionCount: async () => null,
  ethCall: async () => null,
});

const R0 = 10_000_000n; // 10 USDC (6dp)
const R1 = 5_000_000_000_000_000_000n; // 5 WETH (18dp)

describe('onchain EVM reader (mocked Lane T transports)', () => {
  it('reads a V2 pool in two batches (state + decimals per leg)', async () => {
    const multicall = mockMulticall([
      [ok(reservesReturn(R0, R1, 99)), ok(addrWord(USDC)), ok(addrWord(WETH))],
      [ok(word(6n)), ok(word(18n))],
    ]);
    const reader = new OnchainEvmReaderService(
      multicall,
      mockChainRpc('0x1234'),
    );
    const view = await reader.getV2PoolView('ethereum', PAIR);
    expect(view).not.toBeNull();
    expect(view?.legs[0]).toEqual({ token: USDC, reserve: R0, decimals: 6 });
    expect(view?.legs[1]).toEqual({ token: WETH, reserve: R1, decimals: 18 });
    // (10/1e6... spot of WETH in USDC = 10/5 = 2 (synthetic legs).
    expect(view?.price1Per0).toBe(2);
    expect(view?.feeBpsDefault).toBe(30);
    expect(view?.blockTimestampLast).toBe(99);
    expect(multicall.calls).toHaveLength(2);
    expect(multicall.calls[0]).toHaveLength(3);
  });

  it('keeps the V2 view when decimals miss (price null, reserves intact)', async () => {
    const multicall = mockMulticall([
      [ok(reservesReturn(R0, R1, 1)), ok(addrWord(USDC)), ok(addrWord(WETH))],
      [miss, miss],
    ]);
    const reader = new OnchainEvmReaderService(
      multicall,
      mockChainRpc('0x1234'),
    );
    const view = await reader.getV2PoolView('ethereum', PAIR);
    expect(view?.legs[0].decimals).toBeNull();
    expect(view?.price1Per0).toBeNull();
    expect(view?.legs[0].reserve).toBe(R0);
  });

  it('resolves null on aggregate miss, empty pool, and EOA gate', async () => {
    const failing = mockMulticall([[miss, miss, miss]]);
    const reader = new OnchainEvmReaderService(failing, mockChainRpc('0x1234'));
    await expect(reader.getV2PoolView('ethereum', PAIR)).resolves.toBeNull();

    const empty = mockMulticall([
      [ok(reservesReturn(0n, 0n, 1)), ok(addrWord(USDC)), ok(addrWord(WETH))],
    ]);
    const readerEmpty = new OnchainEvmReaderService(
      empty,
      mockChainRpc('0x1234'),
    );
    await expect(
      readerEmpty.getV2PoolView('ethereum', PAIR),
    ).resolves.toBeNull();

    const gated = mockMulticall([[]]);
    const readerGated = new OnchainEvmReaderService(gated, mockChainRpc('0x'));
    await expect(
      readerGated.getV2PoolView('ethereum', PAIR),
    ).resolves.toBeNull();
    expect(gated.calls).toHaveLength(0);
  });

  it('reads a V3 pool (slot0 + liquidity + fee, parity sqrt)', async () => {
    const slot0 =
      `0x${(2n ** 96n).toString(16).padStart(64, '0')}` + '0'.repeat(64 * 6);
    const multicall = mockMulticall([
      [
        ok(slot0),
        ok(word(123456n)),
        ok(addrWord(USDC)),
        ok(addrWord(WETH)),
        ok(word(3000n)),
      ],
      [ok(word(18n)), ok(word(18n))],
    ]);
    const reader = new OnchainEvmReaderService(
      multicall,
      mockChainRpc('0x1234'),
    );
    const view = await reader.getV3PoolView('ethereum', POOL);
    expect(view?.sqrtPriceX96).toBe(2n ** 96n);
    expect(view?.tick).toBe(0);
    expect(view?.liquidity).toBe(123456n);
    expect(view?.fee).toBe(3000);
    expect(view?.price1Per0).toBe(1);
  });

  it('resolves null on uninitialized V3 (sqrtPriceX96 == 0)', async () => {
    const multicall = mockMulticall([
      [
        ok(`0x${'0'.repeat(64 * 7)}`),
        ok(word(1n)),
        ok(addrWord(USDC)),
        ok(addrWord(WETH)),
        ok(word(3000n)),
      ],
    ]);
    const reader = new OnchainEvmReaderService(
      multicall,
      mockChainRpc('0x1234'),
    );
    await expect(reader.getV3PoolView('ethereum', POOL)).resolves.toBeNull();
  });

  it('reads a V4 pool via the StateView lens in ONE batch', async () => {
    const slot0 =
      `0x${(2n ** 96n).toString(16).padStart(64, '0')}` +
      `${'0'.repeat(64)}${'0'.repeat(64)}${word(500n).slice(2)}`;
    const multicall = mockMulticall([[ok(slot0), ok(word(777n))]]);
    const reader = new OnchainEvmReaderService(
      multicall,
      mockChainRpc('0x1234'),
    );
    const view = await reader.getV4PoolView('ethereum', POOL_ID, 18, 18);
    expect(view?.lens).toBe('0x7ffe42c4a5deea5b0fec41c94c136cf115597227');
    expect(view?.sqrtPriceX96).toBe(2n ** 96n);
    expect(view?.lpFee).toBe(500);
    expect(view?.liquidity).toBe(777n);
    expect(view?.price1Per0).toBe(1);
    // Single tryAggregate round trip for the lens leg.
    expect(multicall.calls).toHaveLength(1);
    expect(multicall.calls[0]).toHaveLength(2);
  });

  it('marks V4 unsupported per chain (no batch, explicit null)', async () => {
    const multicall = mockMulticall([[]]);
    const reader = new OnchainEvmReaderService(
      multicall,
      mockChainRpc('0x1234'),
    );
    for (const chain of [
      'bsc',
      'arbitrum',
      'polygon',
      'optimism',
      'unichain',
    ]) {
      await expect(
        reader.getV4PoolView(chain, POOL_ID, 18, 18),
      ).resolves.toBeNull();
    }
    expect(multicall.calls).toHaveLength(0);
    await expect(
      reader.getV4PoolView('ethereum', '0x1234', 18, 18),
    ).resolves.toBeNull();
  });
});
