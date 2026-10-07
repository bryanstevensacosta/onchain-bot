import type { DexScreenerPairSummary } from 'provider/infrastructure/dexscreener';
import { DirectFastPathService } from './direct-fast-path.service';

// Dexter plan todo 28 — Robinhood 64-hex regression.
//
// A Uniswap V4 pool is named by a bytes32 poolId (64 hex), not an
// EVM address (40 hex). DexScreener reports that poolId in
// `pairAddress`; without the shape guard the V2/V3 readers burn
// every RPC tier on `-32602 (length 64, want 40)`. The guard must
// fail-open `null` BEFORE any reader call (spies stay uncalled).
// The poolId below is synthetic shape-only (repeating bytes —
// obviously not a live pool); the token is the pinned NYMA fixture
// (public on-chain address, also in `measurement-fixtures.spec.ts`).
const NYMA_ROBINHOOD = '0x968Be0c1A394Bf1cE239E3b40909eC0F9d4f5583';
const POOL_ID_64 = `0x${'ab'.repeat(32)}`;
const WETH_ROBINHOOD = '0x1111111111111111111111111111111111111111';

const v4Summary = (
  overrides?: Partial<DexScreenerPairSummary>,
): DexScreenerPairSummary => ({
  pairAddress: POOL_ID_64,
  dexId: 'uniswap',
  labels: ['v4'],
  baseToken: { address: NYMA_ROBINHOOD, name: 'NYMA', symbol: 'NYMA' },
  quoteToken: { address: WETH_ROBINHOOD, name: 'Wrapped ETH', symbol: 'WETH' },
  priceUsd: '0.000003676',
  priceNative: '0.000001',
  liquidityUsd: 6070,
  volume24h: 100,
  fdv: 3676,
  marketCap: 3676,
  priceChange24h: 1.5,
  txns24h: { buys: 3, sells: 1 },
  ...overrides,
});

const req = (chain: string, address: string) => ({
  chain,
  address,
  kind: 'token',
});

describe('DirectFastPathService 64-hex poolId guard (todo 28)', () => {
  it('v4-labeled 64-hex pairAddress resolves fail-open null with zero reader calls', async () => {
    const dexscreener = {
      getBestPairSummaryForChain: async () => v4Summary(),
    };
    const evmReader = {
      getV2PoolView: jest.fn(async () => null),
      getV3PoolView: jest.fn(async () => null),
      getV4PoolView: jest.fn(async () => null),
    };
    const service = new DirectFastPathService(
      dexscreener as never,
      null,
      evmReader as never,
      null,
    );
    const result = await service.tryResolve(req('robinhood', NYMA_ROBINHOOD));
    expect(result).toBeNull();
    expect(evmReader.getV2PoolView).not.toHaveBeenCalled();
    expect(evmReader.getV3PoolView).not.toHaveBeenCalled();
    expect(evmReader.getV4PoolView).not.toHaveBeenCalled();
  });

  it('mislabeled 64-hex (v2 label, no 0x prefix) still skips every reader', async () => {
    const dexscreener = {
      getBestPairSummaryForChain: async () =>
        v4Summary({
          pairAddress: 'ab'.repeat(32),
          labels: ['v2'],
        }),
    };
    const evmReader = {
      getV2PoolView: jest.fn(async () => null),
      getV3PoolView: jest.fn(async () => null),
      getV4PoolView: jest.fn(async () => null),
    };
    const service = new DirectFastPathService(
      dexscreener as never,
      null,
      evmReader as never,
      null,
    );
    const result = await service.tryResolve(req('robinhood', NYMA_ROBINHOOD));
    expect(result).toBeNull();
    expect(evmReader.getV2PoolView).not.toHaveBeenCalled();
    expect(evmReader.getV3PoolView).not.toHaveBeenCalled();
    expect(evmReader.getV4PoolView).not.toHaveBeenCalled();
  });

  it('40-hex pairAddress still reaches the V2 reader (guard is shape-only)', async () => {
    const PAIR = '0x2222222222222222222222222222222222222222';
    const TOKEN = '0x1111111111111111111111111111111111111111';
    const USDC = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
    const dexscreener = {
      getBestPairSummaryForChain: async () =>
        v4Summary({
          pairAddress: PAIR,
          dexId: 'uniswap',
          labels: ['v2'],
          baseToken: { address: TOKEN, name: 'Tok', symbol: 'TOK' },
          quoteToken: { address: USDC, name: 'USD Coin', symbol: 'USDC' },
        }),
    };
    const evmReader = {
      getV2PoolView: jest.fn(async () => ({
        family: 'v2',
        chain: 'ethereum',
        pair: PAIR,
        legs: [
          { token: TOKEN, reserve: 5_000_000_000_000_000_000n, decimals: 18 },
          { token: USDC, reserve: 10_000_000n, decimals: 6 },
        ],
        price1Per0: 2,
        feeBpsDefault: 30,
        blockTimestampLast: 1,
      })),
      getV3PoolView: jest.fn(async () => null),
      getV4PoolView: jest.fn(async () => null),
    };
    const service = new DirectFastPathService(
      dexscreener as never,
      null,
      evmReader as never,
      null,
    );
    const result = await service.tryResolve(req('ethereum', TOKEN));
    expect(result).not.toBeNull();
    expect(evmReader.getV2PoolView).toHaveBeenCalledWith('ethereum', PAIR);
    expect(result?.outcome.quote.priceUsd).toBe(2);
  });
});
