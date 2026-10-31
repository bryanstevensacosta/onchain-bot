import type { DexScreenerPairSummary } from 'provider/infrastructure/dexscreener';
import {
  addressToBytes,
  findProgramAddress,
  utf8Seed,
} from 'launchpad/infrastructure/solana-pda';
import { PUMP_FUN_PROGRAM } from 'provider/infrastructure/onchain/solana-program-ids';
import { DirectFastPathService } from './direct-fast-path.service';

/**
 * Bonding curve on the DIRECT FAST PATH (`rick-compact-card` §10.16,
 * plumbing point 10): the info is built from the curve-PDA view the
 * fast path ALREADY reads (`pdaP` — the `[b"bonding-curve", mint]`
 * account), so it costs ZERO added network. A graduated token's curve
 * leg decodes to `null`, and the EVM path never carries one.
 *
 * All readers/dexes are mocked — zero network.
 */
const MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';
const WSOL = 'So11111111111111111111111111111111111111112';
const USDC_SOL = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const ANCHOR_POOL = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';
const TOKEN_ETH = '0x1111111111111111111111111111111111111111';
const PAIR_ETH = '0x2222222222222222222222222222222222222222';

const req = (chain: string, address: string) => ({
  chain,
  address,
  kind: 'token',
});

const CURVE_PDA = findProgramAddress(
  [utf8Seed('bonding-curve'), addressToBytes(MINT)],
  PUMP_FUN_PROGRAM,
).address;

const pumpView = (withCurve: boolean) => ({
  poolAddress: CURVE_PDA,
  family: 'pump',
  legs: [
    { mint: MINT, vault: null, reserve: 1_000_000_000_000n, decimals: 6 },
    { mint: WSOL, vault: null, reserve: 10_000_000_000_000n, decimals: 9 },
  ],
  priceBA: 0.01,
  migrated: false,
  ...(withCurve
    ? {
        curve: {
          realTokenReserves: 272_126_872_931_864n,
          tokenTotalSupply: 1_000_000_000_000_000n,
          quoteMint: 'HytpiyuR3sVXGB5UqoqrnThCPH2X1tWVm5neep3Dpump',
          quoteSymbol: 'Bitcoin',
          progressPercent: 65.69,
        },
      }
    : {}),
});

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
  priceBA: 200,
  migrated: false,
};

const readerWith = (view: ReturnType<typeof pumpView> | null) => ({
  getPoolView: async (pool: string) =>
    pool === ANCHOR_POOL ? anchorView : view,
  getTokenBasics: async () => null,
});

const solanaService = (reader: unknown) =>
  new DirectFastPathService(
    { getBestPairSummaryForChain: async () => null } as never,
    reader as never,
    null,
    null,
  );

describe('DirectFastPathService bondingCurve (§10.16)', () => {
  it('maps the curve-PDA view onto the five-field wire object (zero extra reads)', async () => {
    const service = solanaService(readerWith(pumpView(true)));
    const result = await service.tryResolve(req('solana', MINT));
    expect(result).not.toBeNull();
    expect(result?.bondingCurve).toEqual({
      onCurve: true,
      launchpadId: 'pump-fun',
      quoteSymbol: 'Bitcoin',
      quoteMint: 'HytpiyuR3sVXGB5UqoqrnThCPH2X1tWVm5neep3Dpump',
      progressPercent: 65.69,
    });
    // `poolAddress` is NOT part of the wire shape (pinned).
    expect(result?.bondingCurve).not.toHaveProperty('poolAddress');
  });

  it('curve-PDA view without `curve` (graduated/foreign) => bondingCurve null', async () => {
    const service = solanaService(readerWith(pumpView(false)));
    const result = await service.tryResolve(req('solana', MINT));
    expect(result).not.toBeNull();
    expect(result?.bondingCurve).toBeNull();
  });

  it('curve leg throw fails open (null) and the card still resolves', async () => {
    // The PDA read dies but discovery names a DIFFERENT pool whose view
    // prices fine — the card must still serve, with no curve.
    const discovery: DexScreenerPairSummary = {
      pairAddress: 'pool1111111111111111111111111111111111111',
      dexId: 'raydium',
      labels: ['CPMM'],
      baseToken: { address: MINT, name: 'Mint', symbol: 'MINT' },
      quoteToken: { address: WSOL, name: 'Wrapped SOL', symbol: 'SOL' },
      priceUsd: '1.5',
      priceNative: '0.01',
      liquidityUsd: 1_000_000,
      volume24h: 50_000,
      fdv: 2_000_000,
      marketCap: 1_500_000,
      priceChange24h: 2.5,
      txns24h: { buys: 10, sells: 5 },
      pairCreatedAt: null,
      volume1hUsd: null,
      priceChange1h: null,
      txns1h: null,
    };
    const reader = {
      getPoolView: async (pool: string) => {
        if (pool === CURVE_PDA) throw new Error('account read failed');
        return pool === ANCHOR_POOL ? anchorView : pumpView(true);
      },
      getTokenBasics: async () => null,
    };
    const service = new DirectFastPathService(
      { getBestPairSummaryForChain: async () => discovery } as never,
      reader as never,
      null,
      null,
    );
    const result = await service.tryResolve(req('solana', MINT));
    expect(result).not.toBeNull();
    expect(result?.outcome.quote.priceUsd).toBeCloseTo(2, 6);
    expect(result?.bondingCurve).toBeNull();
  });

  it('EVM path carries bondingCurve null (pump curve is Solana-only)', async () => {
    const summary: DexScreenerPairSummary = {
      pairAddress: PAIR_ETH,
      dexId: 'uniswap',
      labels: ['v2'],
      baseToken: { address: TOKEN_ETH, name: 'Tok', symbol: 'TOK' },
      quoteToken: {
        address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
        name: 'USD Coin',
        symbol: 'USDC',
      },
      priceUsd: '1.5',
      priceNative: '0.01',
      liquidityUsd: 1_000_000,
      volume24h: 50_000,
      fdv: 2_000_000,
      marketCap: 1_500_000,
      priceChange24h: 2.5,
      txns24h: { buys: 10, sells: 5 },
      pairCreatedAt: null,
      volume1hUsd: null,
      priceChange1h: null,
      txns1h: null,
    };
    const evmReader = {
      getV2PoolView: async () => ({
        family: 'v2',
        chain: 'ethereum',
        pair: PAIR_ETH,
        legs: [
          {
            token: TOKEN_ETH,
            reserve: 5_000_000_000_000_000_000n,
            decimals: 18,
          },
          {
            token: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
            reserve: 10_000_000n,
            decimals: 6,
          },
        ],
        price1Per0: 2,
        feeBpsDefault: 30,
        blockTimestampLast: 1,
      }),
      getV3PoolView: async () => null,
      getV4PoolView: async () => null,
    };
    const service = new DirectFastPathService(
      { getBestPairSummaryForChain: async () => summary } as never,
      null,
      evmReader as never,
      null,
    );
    const result = await service.tryResolve(req('ethereum', TOKEN_ETH));
    expect(result).not.toBeNull();
    expect(result?.bondingCurve).toBeNull();
  });
});

/**
 * 5-minute bucket on the fast path (`rick-compact-card` §10.16, dexter
 * `5M` row).
 *
 * MEASURED GAP this pins: the four fields used to be written ONLY by
 * the `dexscreener` quote fetcher, but the fast path serves exactly the
 * class whose bucket exists (SOL/USD-quoted curves always price) and
 * runs no fetchers — staging 2026-10-30 served `volume5mUsd: null` for
 * `FXRorC4…pump` while its pumpfun pair carried `23.93 / -1.58 / 0 / 1`.
 * The harvest reuses the discovery summary (zero extra calls) and the
 * SAME class gate as the fetcher (`readPumpfun5m`).
 */
const pumpSummary = (
  patch: Partial<DexScreenerPairSummary> = {},
): DexScreenerPairSummary => ({
  pairAddress: '7VEVhA6YdaYXT1jttFV5MNGdihzrPGESZW7WDoyFw7gi',
  dexId: 'pumpfun',
  labels: [],
  baseToken: { address: MINT, name: 'PUMP', symbol: 'PUMP' },
  quoteToken: { address: WSOL, name: 'Wrapped SOL', symbol: 'SOL' },
  priceUsd: '0.000002701',
  priceNative: '0.0000001',
  liquidityUsd: null,
  volume24h: 143.32,
  fdv: null,
  marketCap: null,
  priceChange24h: -2.02,
  txns24h: { buys: 6, sells: 6 },
  pairCreatedAt: null,
  volume1hUsd: 143.32,
  priceChange1h: -2.02,
  txns1h: { buys: 6, sells: 6 },
  volume5mUsd: 23.93,
  priceChange5m: -1.58,
  txns5mBuys: 0,
  txns5mSells: 1,
  ...patch,
});

describe('DirectFastPathService 5m bucket (§10.16)', () => {
  it('harvests the four fields from a SOL-quoted pumpfun summary (zero extra calls)', async () => {
    const service = new DirectFastPathService(
      { getBestPairSummaryForChain: async () => pumpSummary() } as never,
      readerWith(pumpView(true)) as never,
      null,
      null,
    );
    const result = await service.tryResolve(req('solana', MINT));
    expect(result).not.toBeNull();
    expect(result?.outcome.quote.volume5mUsd).toBe(23.93);
    expect(result?.outcome.quote.priceChange5m).toBe(-1.58);
    expect(result?.outcome.quote.txns5mBuys).toBe(0);
    expect(result?.outcome.quote.txns5mSells).toBe(1);
  });

  it('silences a non-USD/SOL quote (ZEC) even though the pair carries numbers', async () => {
    const service = new DirectFastPathService(
      {
        getBestPairSummaryForChain: async () =>
          pumpSummary({
            quoteToken: {
              address: 'A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS',
              name: 'ZEC',
              symbol: 'ZEC',
            },
          }),
      } as never,
      readerWith(pumpView(true)) as never,
      null,
      null,
    );
    const result = await service.tryResolve(req('solana', MINT));
    expect(result).not.toBeNull();
    expect(result?.outcome.quote.volume5mUsd).toBeNull();
    expect(result?.outcome.quote.priceChange5m).toBeNull();
    expect(result?.outcome.quote.txns5mBuys).toBeNull();
    expect(result?.outcome.quote.txns5mSells).toBeNull();
  });

  it('ignores a non-pumpfun best pair (migrated/dual-venue card)', async () => {
    const service = new DirectFastPathService(
      {
        getBestPairSummaryForChain: async () =>
          pumpSummary({ dexId: 'meteora' }),
      } as never,
      readerWith(pumpView(true)) as never,
      null,
      null,
    );
    const result = await service.tryResolve(req('solana', MINT));
    expect(result).not.toBeNull();
    expect(result?.outcome.quote.volume5mUsd).toBeNull();
  });
});
