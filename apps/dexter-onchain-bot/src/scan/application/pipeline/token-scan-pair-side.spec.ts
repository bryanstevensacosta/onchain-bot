import { TokenScanPipeline } from './token-scan.pipeline';
import type { MarketDataSnapshot } from '@/scan/infrastructure/market-data/market-data.client';

/**
 * Pair-side attribution regression (plan todo 20 — dexter side is
 * SPEC ONLY, no logic changes: dexter copies the already-correct
 * identity from market-data).
 *
 * Live case (`.omo/notepads/dexter-null-rootcause.md` §8
 * side-finding): the USDC mint sat on the QUOTE side of a PUMP/USDC
 * pool and the pre-fix fetcher reported the base identity, so dexter
 * rendered a USDC query as `PUMP`. Market-data now side-verifies; this
 * spec pins the dexter end of the contract: a snapshot carrying the
 * quote-side identity resolves with that identity on the card.
 *
 * Identity asserts only (`symbol`/`name`) — never `address`
 * equality, which would be tautological (the address is echoed
 * through every layer by construction).
 */
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

function snapshot(
  chain: string,
  address: string,
  overrides: Partial<MarketDataSnapshot> = {},
): MarketDataSnapshot {
  return {
    chain,
    address,
    symbol: 'USDC',
    name: 'USD Coin',
    priceUsd: 0.9998,
    priceChange24h: 0.1,
    marketCapUsd: 999000,
    fdvUsd: 1000000,
    liquidityUsd: 250000,
    lockedLiquidityPercent: null,
    burnedPercent: null,
    volume24hUsd: 5000,
    holders: null,
    top10HolderPercent: null,
    totalSupply: null,
    circulatingSupply: null,
    maxSupply: null,
    devWallets: null,
    devPctSupply: null,
    status: 'ready',
    ...overrides,
  };
}

function makeClient(byChain: Record<string, MarketDataSnapshot | null>) {
  return {
    detectChain: async () => null,
    getSnapshot: async (chain: string) => byChain[chain] ?? null,
  };
}

describe('TokenScanPipeline pair-side identity regression (plan todo 20)', () => {
  it('explicit chain:address with quote-side identity resolves USDC, never PUMP', async () => {
    const pipeline = new TokenScanPipeline(
      makeClient({ solana: snapshot('solana', USDC) }) as never,
    );
    const detailed = await pipeline.resolveDetailed(`solana:${USDC}`);
    expect(detailed.status).toBe('resolved');
    if (detailed.status !== 'resolved') throw new Error('expected resolved');
    expect(detailed.token.symbol).toBe('USDC');
    expect(detailed.token.symbol).not.toBe('PUMP');
    expect(detailed.token.name).toBe('USD Coin');
    expect(detailed.token.chain).toBe('solana');
  });

  it('bare quote-side mint sweeps to the side-verified identity', async () => {
    const pipeline = new TokenScanPipeline(
      makeClient({ solana: snapshot('solana', USDC) }) as never,
    );
    const token = await pipeline.resolve(USDC);
    expect(token?.symbol).toBe('USDC');
    expect(token?.symbol).not.toBe('PUMP');
    expect(token?.name).toBe('USD Coin');
  });

  it('base-side identity still passes through untouched (PUMP stays PUMP)', async () => {
    const pump = 'pumpCmXweJgJGVT4V9M9tB6VsWTxMTZQV5PiHfVPWU5';
    const pipeline = new TokenScanPipeline(
      makeClient({
        solana: snapshot('solana', pump, {
          symbol: 'PUMP',
          name: 'Pump',
        }),
      }) as never,
    );
    const token = await pipeline.resolve(`solana:${pump}`);
    expect(token?.symbol).toBe('PUMP');
    expect(token?.name).toBe('Pump');
  });
});
