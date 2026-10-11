import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import { DirectFastPathService } from './direct-fast-path.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { OnchainSolanaReaderService } from 'provider/infrastructure/onchain/onchain-solana.reader';
import {
  SNAPSHOT_QUOTE_PROVIDERS,
  type SnapshotQuote,
} from '../domain/snapshot-quote.types';

/**
 * Single-seam computed FDV at the merge exit (dexter plan todo 38).
 *
 * The fetcher below stands in for the merged provider outcome (the
 * aggregator contract is first-non-null per field — pinned
 * elsewhere); these specs prove the EXIT: reported FDV never
 * survives, MC recoheres, history rows are tagged.
 */
const INCOME = '7DyyqPAz5RZMiAu9e6h3ynbiREzbNu46gxpJNvimkYdX';

function valueFetcher(quote: Partial<SnapshotQuote>) {
  return {
    name: 'dexscreener',
    supportsChains: ['solana', 'ethereum'],
    fetch: async () => quote,
  };
}

async function buildService(quote: Partial<SnapshotQuote>): Promise<{
  snapshots: AddressSnapshotService;
  history: SnapshotHistoryRepository;
}> {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      SnapshotModule,
    ],
  })
    .overrideProvider(SNAPSHOT_QUOTE_PROVIDERS)
    .useValue([valueFetcher(quote)])
    .overrideProvider(LaunchpadDetectorService)
    .useValue({ detectLaunchpad: async () => null })
    .overrideProvider(DexScreenerService)
    .useValue({
      getBestPairSummary: async () => null,
      getBestPairSummaryForChain: async () => null,
    })
    // No live readers in seam-contract specs.
    .overrideProvider(DirectFastPathService)
    .useValue({ tryResolve: async () => null })
    .overrideProvider(OnchainSolanaReaderService)
    .useValue({
      getPoolView: async () => null,
      getTokenBasics: async () => null,
    })
    .compile();
  return {
    snapshots: module.get(AddressSnapshotService),
    history: module.get(SnapshotHistoryRepository),
  };
}

describe('AddressSnapshotService computed-FDV seam (plan todo 38)', () => {
  it('INCOME: discards reported 3016, serves price×total≈2689 with provenance', async () => {
    const { snapshots, history } = await buildService({
      priceUsd: 0.000002689,
      marketCapUsd: 3016,
      fdvUsd: 3016,
      totalSupply: 1_000_000_000,
      maxSupply: 1_000_000_000,
      symbol: 'INCOME',
      name: 'INCOME',
    });
    const snapshot = await snapshots.getSnapshot({
      chain: 'solana',
      value: INCOME,
      kindHint: 'token',
    });
    expect(snapshot.status).toBe('ready');
    expect(snapshot.fdvUsd).toBeCloseTo(2689, 0);
    expect(snapshot.fdvProvenance).toBe('computed');
    const rows = await history.listRecent(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].quote.fdvUsd).toBeCloseTo(2689, 0);
    expect(rows[0].quote.fdvProvenance).toBe('computed');
  });

  it('recoheres MC as price×circ when circ present (no MC>FDV card)', async () => {
    const { snapshots } = await buildService({
      priceUsd: 10,
      marketCapUsd: 99_999_999,
      fdvUsd: 1,
      totalSupply: 1_000_000,
      circulatingSupply: 400_000,
      maxSupply: 10_000_000,
    });
    const snapshot = await snapshots.getSnapshot({
      chain: 'ethereum',
      value: '0xCfb3a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2',
      kindHint: 'token',
    });
    expect(snapshot.fdvUsd).toBeCloseTo(10_000_000, 6);
    expect(snapshot.marketCapUsd).toBeCloseTo(4_000_000, 6);
    expect(snapshot.marketCapUsd as number).toBeLessThanOrEqual(
      snapshot.fdvUsd as number,
    );
  });

  it('null-supply → null FDV (honest, never 0) with provenance tagged', async () => {
    const { snapshots, history } = await buildService({
      priceUsd: 1.5,
      fdvUsd: 12345,
      symbol: 'TKN',
      name: 'Token',
    });
    const snapshot = await snapshots.getSnapshot({
      chain: 'solana',
      value: INCOME,
      kindHint: 'token',
    });
    expect(snapshot.fdvUsd).toBeNull();
    expect(snapshot.fdvProvenance).toBe('computed');
    const rows = await history.listRecent(1);
    expect(rows[0].quote.fdvProvenance).toBe('computed');
  });

  it('garbage supplies (NaN/negative/zero) → null FDV', async () => {
    for (const totalSupply of [Number.NaN, -100, 0]) {
      const { snapshots } = await buildService({
        priceUsd: 2,
        fdvUsd: 777,
        totalSupply,
      });
      const snapshot = await snapshots.getSnapshot({
        chain: 'solana',
        value: INCOME,
        kindHint: 'token',
      });
      expect(snapshot.fdvUsd).toBeNull();
    }
  });
});
