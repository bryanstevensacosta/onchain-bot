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
 * Tail-degraded pin-through (dexter plan todo 41b, ONE decision): a
 * market-data card served without tail extras (`degraded: true`)
 * resolves WITH the bit on the token — the honesty mechanism
 * downstream (preview token → frontend `Partial data` badge). Full
 * snapshots resolve with explicit `false`, never `undefined`, so
 * every boundary can spec-assert the bit (same rule as the stale
 * trio it rides with — stale AND degraded are independent bits).
 */
describe('TokenScanPipeline degraded pin-through (plan todo 41)', () => {
  it('resolves a degraded card with degraded:true on the token', async () => {
    const pipeline = new TokenScanPipeline(
      makeClient(snapshot({ degraded: true })) as never,
    );
    const outcome = await pipeline.resolveDetailed(`solana:${SOL}`);
    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;
    expect(outcome.token.degraded).toBe(true);
    expect(outcome.token.stale).toBe(false);
  });

  it('resolves a full snapshot with explicit degraded:false', async () => {
    const pipeline = new TokenScanPipeline(makeClient(snapshot()) as never);
    const outcome = await pipeline.resolveDetailed(`solana:${SOL}`);
    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;
    expect(outcome.token.degraded).toBe(false);
  });

  it('carries stale + degraded independently on a stale-degraded card', async () => {
    const pipeline = new TokenScanPipeline(
      makeClient(
        snapshot({
          stale: true,
          staleAsOf: '2026-10-06T12:00:00.000Z',
          staleAgeMs: 3_600_000,
          degraded: true,
        }),
      ) as never,
    );
    const outcome = await pipeline.resolveDetailed(`solana:${SOL}`);
    expect(outcome.status).toBe('resolved');
    if (outcome.status !== 'resolved') return;
    expect(outcome.token.stale).toBe(true);
    expect(outcome.token.degraded).toBe(true);
  });
});
