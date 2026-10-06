import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import { DirectFastPathService } from './direct-fast-path.service';
import { LaunchpadDetectorService } from 'provider/launchpad/application/launchpad-detector.service';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { SNAPSHOT_QUOTE_PROVIDERS } from '../domain/snapshot-quote.types';
import { emptySnapshotQuote } from '../domain/snapshot-quote.types';
import { selectPreferredQuote } from 'provider/infrastructure/onchain/evm-tolerance';

const nullFetcher = {
  name: 'dexscreener',
  supportsChains: ['solana', 'ethereum', 'bsc', 'base', 'arbitrum', 'polygon'],
  fetch: async () => null,
};

const fastResult = {
  outcome: {
    quote: { ...emptySnapshotQuote(), priceUsd: 2, liquidityUsd: 20 },
    sources: ['onchain-direct'],
    errors: { 'onchain-direct': 'fast-path partial' },
    allFailed: false,
  },
  venue: null,
  launchpad: null,
  timings: { discoveryMs: 10, directMs: 50, launchpadMs: null, totalMs: 60 },
};

const moduleWithFastPath = (fastPath: unknown) =>
  Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      SnapshotModule,
    ],
  })
    .overrideProvider(SNAPSHOT_QUOTE_PROVIDERS)
    .useValue([nullFetcher])
    .overrideProvider(LaunchpadDetectorService)
    .useValue({ detectLaunchpad: async () => null })
    .overrideProvider(DexScreenerService)
    .useValue({
      getBestPairSummary: async () => null,
      getBestPairSummaryForChain: async () => null,
    })
    .overrideProvider(DirectFastPathService)
    .useValue(fastPath)
    .compile();

describe('AddressSnapshotService fast-path wiring', () => {
  it('serves direct-first (skips dev, still persists + caches)', async () => {
    const module = await moduleWithFastPath({
      tryResolve: async () => fastResult,
    });
    const snapshots = module.get(AddressSnapshotService);
    const input = {
      chain: 'solana',
      value: 'So11111111111111111111111111111111111111112',
      kindHint: 'token' as const,
    };
    const first = await snapshots.getSnapshot(input);
    expect(first.status).toBe('ready');
    expect(first.sources).toEqual(['onchain-direct']);
    expect(first.priceUsd).toBe(2);
    expect(first.liquidityUsd).toBe(20);
    expect(first.devWallets).toBeNull();
    expect(first.providerErrors['dev:fast-path']).toContain('skipped');
    // History + cache still written on the fast card: repeat is a HIT.
    const second = await snapshots.getSnapshot(input);
    expect(second.priceUsd).toBe(2);
    await module.close();
  });

  it('falls back byte-identical when the fast path misses', async () => {
    const module = await moduleWithFastPath({
      tryResolve: async () => null,
    });
    const snapshots = module.get(AddressSnapshotService);
    const snapshot = await snapshots.getSnapshot({
      chain: 'solana',
      value: 'So11111111111111111111111111111111111111112',
      kindHint: 'token',
    });
    // Same contract as the pre-wire pipeline: all-null fan-out.
    expect(snapshot.status).toBe('pending');
    expect(snapshot.priceUsd).toBeNull();
    expect(snapshot.providerErrors['dev:fast-path']).toBeUndefined();
    await module.close();
  });

  it('tolerance comparator takes a live-shaped aggregator quote (log-only)', async () => {
    // Static capture of a DexScreener-plausible aggregator quote shape
    // (no network): within-tolerance converges silently, a 50% gap
    // diverges but STILL serves direct (render never gated).
    const aggregator = {
      ...emptySnapshotQuote(),
      priceUsd: 2.005,
      liquidityUsd: 1_000_000,
      volume24hUsd: 50_000,
      symbol: 'MINT',
      name: 'Mint',
    };
    const direct = { priceUsd: 2, liquidityUsd: 999_000 };
    const converged = selectPreferredQuote(direct, aggregator, {
      logger: { warn: () => undefined },
    });
    expect(converged.diverged).toBe(false);
    expect(converged.quote.priceUsd).toBe(2);
    expect(converged.quote.volume24hUsd).toBe(50_000);

    const seen: string[] = [];
    const diverged = selectPreferredQuote({ priceUsd: 3 }, aggregator, {
      logger: { warn: (message: string) => seen.push(message) },
    });
    expect(diverged.diverged).toBe(true);
    expect(diverged.quote.priceUsd).toBe(3);
    expect(seen).toHaveLength(1);
  });
});
