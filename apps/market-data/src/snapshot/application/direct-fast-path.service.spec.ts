import type { DexScreenerPairSummary } from 'provider/infrastructure/dexscreener';
import { addressToBytes } from 'launchpad/infrastructure/solana-pda';
import { anchorDiscriminator } from 'provider/infrastructure/onchain/solana-program-ids';
import {
  DIRECT_FAST_PATH_SOURCE,
  DirectFastPathService,
} from './direct-fast-path.service';

const MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';
const WSOL = 'So11111111111111111111111111111111111111112';
const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const USDC_ETH = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const TOKEN_ETH = '0x1111111111111111111111111111111111111111';
const PAIR_ETH = '0x2222222222222222222222222222222222222222';

const summary = (
  overrides?: Partial<DexScreenerPairSummary>,
): DexScreenerPairSummary => ({
  pairAddress: 'pool1111111111111111111111111111111111111',
  dexId: 'raydium',
  labels: [],
  baseToken: { address: MINT, name: 'Mint', symbol: 'MINT' },
  quoteToken: { address: USDC_SOL, name: 'USD Coin', symbol: 'USDC' },
  priceUsd: '1.5',
  priceNative: '0.01',
  liquidityUsd: 1_000_000,
  volume24h: 50_000,
  fdv: 2_000_000,
  marketCap: 1_500_000,
  priceChange24h: 2.5,
  txns24h: { buys: 10, sells: 5 },
  ...overrides,
});

const req = (chain: string, address: string) => ({
  chain,
  address,
  kind: 'token',
});

describe('DirectFastPathService (mocked readers, no network)', () => {
  it('serves an EVM V2 stable-quoted pool direct (price + 2x liq)', async () => {
    const r0 = 10_000_000n; // 10 USDC
    const r1 = 5_000_000_000_000_000_000n; // 5 TOK (18dp)
    const dexscreener = {
      getBestPairSummaryForChain: async () =>
        summary({
          pairAddress: PAIR_ETH,
          dexId: 'uniswap',
          labels: ['v2'],
          baseToken: { address: TOKEN_ETH, name: 'Tok', symbol: 'TOK' },
          quoteToken: { address: USDC_ETH, name: 'USD Coin', symbol: 'USDC' },
        }),
    };
    const evmReader = {
      getV2PoolView: async () => ({
        family: 'v2',
        chain: 'ethereum',
        pair: PAIR_ETH,
        legs: [
          { token: TOKEN_ETH, reserve: r1, decimals: 18 },
          { token: USDC_ETH, reserve: r0, decimals: 6 },
        ],
        price1Per0: 2,
        feeBpsDefault: 30,
        blockTimestampLast: 1,
      }),
      getV3PoolView: async () => null,
      getV4PoolView: async () => null,
    };
    const service = new DirectFastPathService(
      dexscreener as never,
      null,
      evmReader as never,
      { detectLaunchpad: async () => ({ origin: 'uniswap' }) } as never,
    );
    const result = await service.tryResolve(req('ethereum', TOKEN_ETH));
    expect(result).not.toBeNull();
    // 10 USDC / 5 TOK = $2.
    expect(result?.outcome.quote.priceUsd).toBe(2);
    expect(result?.outcome.quote.liquidityUsd).toBe(20);
    expect(result?.outcome.sources).toEqual([DIRECT_FAST_PATH_SOURCE]);
    expect(result?.outcome.quote.symbol).toBe('TOK');
    expect(result?.venue).not.toBeNull();
    expect(result?.launchpad).toEqual({ origin: 'uniswap' });
    expect(result?.timings.totalMs).toBeGreaterThanOrEqual(0);
  });

  it('serves an EVM V3 stable-quoted spot (price direct, TVL honestly null)', async () => {
    const dexscreener = {
      getBestPairSummaryForChain: async () =>
        summary({
          pairAddress: PAIR_ETH,
          dexId: 'uniswap',
          labels: ['v3'],
          baseToken: { address: TOKEN_ETH, name: 'Tok', symbol: 'TOK' },
          quoteToken: { address: USDC_ETH, name: 'USD Coin', symbol: 'USDC' },
        }),
    };
    const evmReader = {
      getV2PoolView: async () => null,
      // token0 = TOK, token1 = USDC, 2 USDC per TOK.
      getV3PoolView: async () => ({
        family: 'v3',
        chain: 'ethereum',
        pool: PAIR_ETH,
        token0: TOKEN_ETH,
        token1: USDC_ETH,
        decimals0: 18,
        decimals1: 6,
        sqrtPriceX96: 123n,
        tick: 1,
        liquidity: 999n,
        fee: 3000,
        price1Per0: 2,
      }),
      getV4PoolView: async () => null,
    };
    const service = new DirectFastPathService(
      dexscreener as never,
      null,
      evmReader as never,
      null,
    );
    const result = await service.tryResolve(req('ethereum', TOKEN_ETH));
    expect(result?.outcome.quote.priceUsd).toBe(2);
    expect(result?.outcome.quote.liquidityUsd).toBeNull();
    expect(result?.outcome.errors[DIRECT_FAST_PATH_SOURCE]).toContain('v3 TVL');
  });

  it('falls back on mint-not-on-legs, no discovery, and non-token kinds', async () => {
    const dexscreener = {
      getBestPairSummaryForChain: async () =>
        summary({
          pairAddress: PAIR_ETH,
          dexId: 'uniswap',
          labels: ['v2'],
          baseToken: {
            address: '0x3333333333333333333333333333333333333333',
            name: 'X',
            symbol: 'X',
          },
          quoteToken: { address: USDC_ETH, name: 'USD Coin', symbol: 'USDC' },
        }),
    };
    const evmReader = {
      getV2PoolView: async () => ({
        legs: [
          {
            token: '0x3333333333333333333333333333333333333333',
            reserve: 1n,
            decimals: 18,
          },
          { token: USDC_ETH, reserve: 2_000_000n, decimals: 6 },
        ],
        price1Per0: 2,
      }),
      getV3PoolView: async () => null,
      getV4PoolView: async () => null,
    };
    const service = new DirectFastPathService(
      dexscreener as never,
      null,
      evmReader as never,
      null,
    );
    await expect(
      service.tryResolve(req('ethereum', TOKEN_ETH)),
    ).resolves.toBeNull();

    const noDiscovery = new DirectFastPathService(
      { getBestPairSummaryForChain: async () => null } as never,
      null,
      evmReader as never,
      null,
    );
    await expect(
      noDiscovery.tryResolve(req('ethereum', TOKEN_ETH)),
    ).resolves.toBeNull();

    const walletKind = new DirectFastPathService(
      dexscreener as never,
      null,
      evmReader as never,
      null,
    );
    await expect(
      walletKind.tryResolve({
        chain: 'ethereum',
        address: TOKEN_ETH,
        kind: 'wallet',
      }),
    ).resolves.toBeNull();
  });

  it('aborts on deadline (hung reader never blocks past budget)', async () => {
    const hung = {
      getV2PoolView: async () => new Promise<null>(() => undefined),
      getV3PoolView: async () => new Promise<null>(() => undefined),
      getV4PoolView: async () => new Promise<null>(() => undefined),
    };
    const dexscreener = {
      getBestPairSummaryForChain: async () =>
        summary({
          pairAddress: PAIR_ETH,
          dexId: 'uniswap',
          labels: ['v2'],
          baseToken: { address: TOKEN_ETH, name: 'Tok', symbol: 'TOK' },
          quoteToken: { address: USDC_ETH, name: 'USD Coin', symbol: 'USDC' },
        }),
    };
    const service = new DirectFastPathService(
      dexscreener as never,
      null,
      hung as never,
      null,
    );
    const started = performance.now();
    await expect(
      service.tryResolve(req('ethereum', TOKEN_ETH), 25),
    ).resolves.toBeNull();
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('serves a Solana pump curve via the PDA leg with the pinned anchor', async () => {
    const mint = MINT;
    const solPerToken = 0.01;
    const anchorSolUsd = 200;
    const pumpView = {
      poolAddress: 'curve111111111111111111111111111111111111',
      family: 'pump',
      legs: [
        { mint, vault: null, reserve: 1_000_000_000_000n, decimals: 6 },
        { mint: WSOL, vault: null, reserve: 10_000_000_000_000n, decimals: 9 },
      ],
      priceBA: solPerToken,
      migrated: false,
    };
    const anchorView = {
      poolAddress: 'anchor111111111111111111111111111111111111',
      family: 'raydium-amm-v4',
      legs: [
        { mint: WSOL, vault: null, reserve: 100_000_000_000_000n, decimals: 9 },
        {
          mint: USDC_SOL,
          vault: null,
          reserve: 20_000_000_000_000n,
          decimals: 6,
        },
      ],
      priceBA: anchorSolUsd,
      migrated: false,
    };
    const solanaReader = {
      getPoolView: async (pool: string) =>
        // The service passes the real pinned SOL/USDC anchor pool here
        // (58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2).
        pool === '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2'
          ? anchorView
          : pumpView,
      getTokenBasics: async () => ({
        mint,
        supply: { amount: '1000000000000', decimals: 6 },
        holders: [{ address: 'h1', amount: '1', sharePercent: 50 }],
        top10SharePercent: 50,
        metadata: { name: 'Mint', symbol: 'MINT', uri: '' },
      }),
    };
    const service = new DirectFastPathService(
      { getBestPairSummaryForChain: async () => null } as never,
      solanaReader as never,
      null,
      null,
    );
    const result = await service.tryResolve(req('solana', mint));
    expect(result).not.toBeNull();
    // 10,000 SOL / 1M tokens = 0.01 SOL/token x $200 = $2.
    expect(result?.outcome.quote.priceUsd).toBeCloseTo(2, 6);
    expect(result?.outcome.quote.holders).toBe(1);
    expect(result?.outcome.quote.symbol).toBe('MINT');
    expect(result?.outcome.quote.totalSupply).toBeCloseTo(1_000_000, 3);
  });

  it('falls back when the anchor read fails (no guessed FX)', async () => {
    const mint = MINT;
    const solanaReader = {
      getPoolView: async (pool: string) =>
        pool.includes('anchor')
          ? null
          : {
              poolAddress: 'curve1',
              family: 'pump',
              legs: [
                { mint, vault: null, reserve: 1_000_000_000_000n, decimals: 6 },
                {
                  mint: WSOL,
                  vault: null,
                  reserve: 10_000_000_000n,
                  decimals: 9,
                },
              ],
              priceBA: 0.01,
              migrated: false,
            },
      getTokenBasics: async () => null,
    };
    const service = new DirectFastPathService(
      { getBestPairSummaryForChain: async () => null } as never,
      solanaReader as never,
      null,
      null,
    );
    // Anchor pool address never contains 'anchor', so the anchor read
    // returns the pump view (legs without USDC) -> anchor rejected.
    await expect(service.tryResolve(req('solana', mint))).resolves.toBeNull();
  });

  it('reads the lean CLMM anchor in one batch (wrong mints rejected)', async () => {
    const mint = MINT;
    // Fabricated Raydium CLMM struct: SOL(9dp)/USDC(6dp), sqrt = 2^64
    // (parity spot) -> $1000/SOL; pump leg 0.01 SOL/token -> $10.
    const struct = Buffer.alloc(400);
    Buffer.from(anchorDiscriminator('PoolState')).copy(struct, 0);
    Buffer.from(addressToBytes(WSOL)).copy(struct, 73);
    Buffer.from(addressToBytes(USDC_SOL)).copy(struct, 105);
    struct[233] = 9;
    struct[234] = 6;
    struct.writeUInt16LE(1, 235);
    struct.writeBigUInt64LE(1n, 237);
    struct.writeBigUInt64LE(0n, 245);
    struct.writeBigUInt64LE(0n, 253);
    struct.writeBigUInt64LE(1n, 261);
    struct.writeInt32LE(0, 269);
    const account = (payload: Buffer) => ({
      data: [payload.toString('base64'), 'base64'],
      executable: false,
      lamports: 1,
      owner: 'owner',
      rentEpoch: 1,
      space: payload.length,
    });
    const pumpView = {
      poolAddress: 'curve1',
      family: 'pump',
      legs: [
        { mint, vault: null, reserve: 1_000_000_000_000n, decimals: 6 },
        { mint: WSOL, vault: null, reserve: 10_000_000_000_000n, decimals: 9 },
      ],
      priceBA: 0.01,
      migrated: false,
    };
    const solanaReader = {
      getPoolView: async () => pumpView,
      getTokenBasics: async () => ({
        mint,
        supply: { amount: '1000000000000', decimals: 6 },
        holders: [],
        top10SharePercent: null,
        metadata: { name: 'Mint', symbol: 'MINT', uri: '' },
      }),
    };
    const withLean = new DirectFastPathService(
      { getBestPairSummaryForChain: async () => null } as never,
      solanaReader as never,
      null,
      null,
      { getMultiple: async () => [account(struct)] } as never,
    );
    const served = await withLean.tryResolve(req('solana', mint));
    expect(served?.outcome.quote.priceUsd).toBeCloseTo(10, 6);

    const badStruct = Buffer.from(struct);
    Buffer.from(addressToBytes(WSOL)).copy(badStruct, 105);
    const noAnchor = new DirectFastPathService(
      { getBestPairSummaryForChain: async () => null } as never,
      {
        getPoolView: async () => null,
        getTokenBasics: async () => null,
      } as never,
      null,
      null,
      { getMultiple: async () => [account(badStruct)] } as never,
    );
    await expect(noAnchor.tryResolve(req('solana', mint))).resolves.toBeNull();
  });
});
