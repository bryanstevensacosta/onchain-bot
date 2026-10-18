import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import { DirectFastPathService } from './direct-fast-path.service';
import { AddressExistenceService } from './address-existence.service';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { SNAPSHOT_QUOTE_PROVIDERS } from '../domain/snapshot-quote.types';

const nullFetcher = {
  name: 'dexscreener',
  supportsChains: ['solana', 'ethereum', 'bsc', 'base', 'arbitrum', 'polygon'],
  fetch: async () => null,
};

describe('AddressSnapshotService (snapshot per kind)', () => {
  let snapshots: AddressSnapshotService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
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
      // Fallback contract pin: the pre-wire fan-out path runs with
      // the fast path disabled (fast-path behavior lives in the
      // dedicated fast-path specs — no live readers here).
      .overrideProvider(DirectFastPathService)
      .useValue({ tryResolve: async () => null })
      // Hermetic derivation/seed legs (todo 33/46/68): the real adapters
      // must never run in this suite — a live Gecko pool answer for
      // `So111...112` derives a change and flips this pin to `ready`
      // (pre-existing network flake class; see the fast-path spec note).
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
      .compile();
    snapshots = module.get(AddressSnapshotService);
  });

  it('snapshots kind=token (the absorbed token path)', async () => {
    const snapshot = await snapshots.getSnapshot({
      chain: 'solana',
      value: 'So11111111111111111111111111111111111111112',
      kindHint: 'token',
    });
    expect(snapshot.chain).toBe('solana');
    expect(snapshot.kind).toBe('token');
    expect(snapshot.status).toBe('pending');
    expect(Array.isArray(snapshot.providers)).toBe(true);
  });

  it('snapshots kind=wallet', async () => {
    const snapshot = await snapshots.getSnapshot({
      chain: 'ethereum',
      value: '0x0000000000000000000000000000000000000001',
      kindHint: 'wallet',
    });
    expect(snapshot.kind).toBe('wallet');
    expect(snapshot.status).toBe('pending');
  });

  it('snapshots kind=program', async () => {
    const snapshot = await snapshots.getSnapshot({
      chain: 'solana',
      value: '11111111111111111111111111111111',
    });
    expect(snapshot.kind).toBe('program');
  });

  it('snapshots kind=exchange', async () => {
    const snapshot = await snapshots.getSnapshot({
      chain: 'solana',
      value: 'So11111111111111111111111111111111111111112',
      kindHint: 'exchange',
    });
    expect(snapshot.kind).toBe('exchange');
  });

  it('snapshots unknown kind explicitly instead of crashing', async () => {
    const snapshot = await snapshots.getSnapshot({
      chain: 'ethereum',
      value: 'not-an-address',
      kindHint: 'vault',
    });
    expect(snapshot.kind).toBe('unknown');
    expect(snapshot.status).toBe('pending');
  });

  it('requires a chain qualifier (mandatory)', async () => {
    await expect(
      snapshots.getSnapshot({ chain: '', value: '0xabc' }),
    ).rejects.toThrow();
  });
});
