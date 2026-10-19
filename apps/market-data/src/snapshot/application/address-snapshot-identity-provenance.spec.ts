import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import {
  DIRECT_FAST_PATH_SOURCE,
  DirectFastPathService,
} from './direct-fast-path.service';
import { AddressExistenceService } from './address-existence.service';
import { GoplusService } from 'provider/infrastructure/goplus';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { OnchainSolanaReaderService } from 'provider/infrastructure/onchain/onchain-solana.reader';
import {
  SNAPSHOT_QUOTE_PROVIDERS,
  emptySnapshotQuote,
  type SnapshotQuote,
} from '../domain/snapshot-quote.types';

/**
 * Identity provenance + metadata last resort (dexter plan todo 39).
 *
 * Ordering pin: the metadata PDA is read ONLY post-merge, when the
 * merged quote names nothing and the fast path pinned no source —
 * provider data is never shadowed (a Gecko-only token keeps its
 * market card). The healthy path pays zero metadata calls.
 */
const INCOME = '7DyyqPAz5RZMiAu9e6h3ynbiREzbNu46gxpJNvimkYdX';
const EVM_DEAD = '0x1111111111111111111111111111111111111111';

function nullFetcher() {
  return {
    name: 'dexscreener',
    supportsChains: ['solana', 'ethereum'],
    fetch: async () => null,
  };
}

function valueFetcher(quote: Partial<SnapshotQuote>) {
  return {
    name: 'dexscreener',
    supportsChains: ['solana', 'ethereum'],
    fetch: async () => quote,
  };
}

function basicsReader(
  metadata: {
    name: string;
    symbol: string;
    uri: string;
    isMutable: boolean;
  } | null,
  calls: { count: number },
) {
  return {
    getPoolView: async () => null,
    getTokenBasics: async () => {
      calls.count += 1;
      if (metadata === null) return null;
      return {
        mint: INCOME,
        supply: null,
        holders: null,
        top10SharePercent: null,
        metadata,
      };
    },
  };
}

async function buildService(args: {
  readonly fetchers: ReadonlyArray<unknown>;
  readonly reader: unknown;
  readonly fastPath?: unknown;
}): Promise<{
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
    .useValue(args.fetchers)
    .overrideProvider(LaunchpadDetectorService)
    .useValue({ detectLaunchpad: async () => null })
    .overrideProvider(DexScreenerService)
    .useValue({
      getBestPairSummary: async () => null,
      getBestPairSummaryForChain: async () => null,
    })
    .overrideProvider(OnchainSolanaReaderService)
    .useValue(args.reader)
    .overrideProvider(DirectFastPathService)
    .useValue(
      args.fastPath ?? {
        tryResolve: async () => null,
      },
    )
    // Hermetic derivation/seed legs (todo 33/46/68): no live Gecko in
    // this suite (network flake class — see fast-path spec note).
    .overrideProvider(GeckoTerminalService)
    .useValue({
      getTokenPools: async () => null,
      searchPools: async () => null,
      getPoolOhlcv: async () => null,
      getPoolOhlcvDay: async () => null,
    })
    .overrideProvider(BirdeyeService)
    .useValue({ getTokenOhlcv: async () => null })
    // Hermetic existence gate (todo 21b): fail-open stub — no live RPC
    // tier walk inside this suite.
    .overrideProvider(AddressExistenceService)
    .useValue({
      probe: async () => ({
        verdict: 'unresolved',
        reason: 'spec stub (fail-open)',
        ms: 0,
      }),
    })
    // Hermetic honeypot leg (todo 71): eth token snapshots in this
    // suite would otherwise reach the live GoPlus API. Definitive
    // absence = zero network, no field, no note.
    .overrideProvider(GoplusService)
    .useValue({
      getTokenSecurity: async () => ({ kind: 'definitive-absence' }),
    })
    .compile();
  return {
    snapshots: module.get(AddressSnapshotService),
    history: module.get(SnapshotHistoryRepository),
  };
}

describe('AddressSnapshotService identity provenance (plan todo 39)', () => {
  it('metadata-resolves-with-marker: identity-less merge + metadata PDA -> metadata provenance, honest null numbers', async () => {
    const calls = { count: 0 };
    const { snapshots, history } = await buildService({
      fetchers: [nullFetcher()],
      reader: basicsReader(
        { name: 'Dead Token', symbol: 'DEAD', uri: '', isMutable: true },
        calls,
      ),
    });
    const snapshot = await snapshots.getSnapshot({
      chain: 'solana',
      value: INCOME,
      kindHint: 'token',
    });
    expect(calls.count).toBe(1);
    expect(snapshot.symbol).toBe('DEAD');
    expect(snapshot.name).toBe('Dead Token');
    expect(snapshot.identityProvenance).toBe('metadata');
    expect(snapshot.status).toBe('pending');
    expect(snapshot.priceUsd).toBeNull();
    expect(snapshot.liquidityUsd).toBeNull();
    const rows = await history.listRecent(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].quote.identityProvenance).toBe('metadata');
  });

  it('mutable metadata resolves identically (marker downstream, never blocked)', async () => {
    const calls = { count: 0 };
    const { snapshots } = await buildService({
      fetchers: [nullFetcher()],
      reader: basicsReader(
        { name: 'Mutable Meme', symbol: 'MM', uri: '', isMutable: true },
        calls,
      ),
    });
    const snapshot = await snapshots.getSnapshot({
      chain: 'solana',
      value: INCOME,
      kindHint: 'token',
    });
    expect(snapshot.symbol).toBe('MM');
    expect(snapshot.identityProvenance).toBe('metadata');
  });

  it('market-first: named merge never touches the metadata leg (zero-cost healthy path)', async () => {
    const calls = { count: 0 };
    const { snapshots } = await buildService({
      fetchers: [valueFetcher({ symbol: 'MKT', name: 'Market Token' })],
      reader: basicsReader(
        { name: 'Shadow', symbol: 'SHDW', uri: '', isMutable: true },
        calls,
      ),
    });
    const snapshot = await snapshots.getSnapshot({
      chain: 'solana',
      value: INCOME,
      kindHint: 'token',
    });
    expect(calls.count).toBe(0);
    expect(snapshot.symbol).toBe('MKT');
    expect(snapshot.name).toBe('Market Token');
    expect(snapshot.identityProvenance).toBe('market');
  });

  it('fast-path pinned source survives the seam (metadata preserved, no re-read)', async () => {
    const calls = { count: 0 };
    const fastQuote = {
      ...emptySnapshotQuote(),
      priceUsd: 2,
      symbol: 'FAST',
      name: 'Fast Token',
      identityProvenance: 'metadata' as const,
    };
    const { snapshots } = await buildService({
      fetchers: [nullFetcher()],
      reader: basicsReader(
        { name: 'Shadow', symbol: 'SHDW', uri: '', isMutable: true },
        calls,
      ),
      fastPath: {
        tryResolve: async () => ({
          outcome: {
            quote: fastQuote,
            sources: [DIRECT_FAST_PATH_SOURCE],
            errors: {},
            allFailed: false,
          },
          venue: null,
          launchpad: null,
          timings: {
            discoveryMs: 1,
            directMs: 1,
            launchpadMs: null,
            totalMs: 2,
            v2Ms: null,
            v3Ms: null,
            anchorMs: null,
          },
        }),
      },
    });
    const snapshot = await snapshots.getSnapshot({
      chain: 'solana',
      value: INCOME,
      kindHint: 'token',
    });
    expect(calls.count).toBe(0);
    expect(snapshot.symbol).toBe('FAST');
    expect(snapshot.identityProvenance).toBe('metadata');
  });

  it('no-metadata intact: nothing anywhere -> null identity, null provenance, pending', async () => {
    const calls = { count: 0 };
    const { snapshots } = await buildService({
      fetchers: [nullFetcher()],
      reader: basicsReader(null, calls),
    });
    const snapshot = await snapshots.getSnapshot({
      chain: 'solana',
      value: INCOME,
      kindHint: 'token',
    });
    expect(calls.count).toBe(1);
    expect(snapshot.symbol).toBeNull();
    expect(snapshot.name).toBeNull();
    expect(snapshot.identityProvenance).toBeNull();
    expect(snapshot.status).toBe('pending');
  });

  it('EVM identity-less never touches the Solana leg (Solana-only scope)', async () => {
    const calls = { count: 0 };
    const { snapshots } = await buildService({
      fetchers: [nullFetcher()],
      reader: basicsReader(
        { name: 'Shadow', symbol: 'SHDW', uri: '', isMutable: true },
        calls,
      ),
    });
    const snapshot = await snapshots.getSnapshot({
      chain: 'ethereum',
      value: EVM_DEAD,
      kindHint: 'token',
    });
    expect(calls.count).toBe(0);
    expect(snapshot.identityProvenance).toBeNull();
    expect(snapshot.status).toBe('pending');
  });
});
