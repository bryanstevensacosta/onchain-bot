import { TokenScanPipeline } from './token-scan.pipeline';
import type { MarketDataSnapshot } from '@/scan/infrastructure/market-data/market-data.client';

const SOL = 'So11111111111111111111111111111111111111112';

function snapshot(
  overrides: Partial<MarketDataSnapshot> = {},
): MarketDataSnapshot {
  return {
    chain: 'solana',
    address: SOL,
    symbol: 'WIF',
    name: 'dogwifhat',
    priceUsd: 1.5,
    priceChange24h: null,
    marketCapUsd: null,
    fdvUsd: null,
    liquidityUsd: null,
    lockedLiquidityPercent: null,
    burnedPercent: null,
    volume24hUsd: null,
    holders: null,
    top10HolderPercent: null,
    status: 'ready',
    ...overrides,
  } as MarketDataSnapshot;
}

function makeClient(entry: MarketDataSnapshot | null) {
  return {
    detectChain: async () => null,
    getSnapshot: async () => entry,
  };
}

/**
 * Serve-stale pin-through (dexter plan todo 19b1): a market-data
 * replay (`stale: true`) resolves WITH the bit on the token — the
 * honesty mechanism downstream (preview token → frontend badge).
 * Fresh snapshots resolve with explicit `false`/`null`s, never
 * `undefined`, so every boundary can spec-assert the bit.
 */
describe('TokenScanPipeline stale pin-through (plan todo 19b1)', () => {
  it('resolves a stale replay with stale:true + as-of + age on the token', async () => {
    const pipeline = new TokenScanPipeline(
      makeClient(
        snapshot({
          stale: true,
          staleAsOf: '2026-10-06T12:00:00.000Z',
          staleAgeMs: 3_600_000,
        }),
      ) as never,
    );
    const outcome = await pipeline.resolveDetailed(`solana:${SOL}`);
    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;
    expect(outcome.token.symbol).toBe('WIF');
    expect(outcome.token.stale).toBe(true);
    expect(outcome.token.staleAsOf).toBe('2026-10-06T12:00:00.000Z');
    expect(outcome.token.staleAgeMs).toBe(3_600_000);
  });

  it('resolves a fresh snapshot with explicit stale:false + null as-of/age', async () => {
    const pipeline = new TokenScanPipeline(makeClient(snapshot()) as never);
    const outcome = await pipeline.resolveDetailed(`solana:${SOL}`);
    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;
    expect(outcome.token.stale).toBe(false);
    expect(outcome.token.staleAsOf).toBeNull();
    expect(outcome.token.staleAgeMs).toBeNull();
  });

  it('resolve() still returns the stale token (bot card path unchanged)', async () => {
    const pipeline = new TokenScanPipeline(
      makeClient(snapshot({ stale: true })) as never,
    );
    const token = await pipeline.resolve(`solana:${SOL}`);
    expect(token?.stale).toBe(true);
  });
});
