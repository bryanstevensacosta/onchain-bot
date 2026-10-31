import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from 'cache/cache.module';
import { SnapshotModule } from '../snapshot.module';
import {
  AddressSnapshotService,
  SNAPSHOT_PUMP_CURVE_TIMEOUT_MS,
} from './address-snapshot.service';
import { DirectFastPathService } from './direct-fast-path.service';
import { AddressExistenceService } from './address-existence.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { ChainCatalogPort } from 'chain/application/ports/chain-catalog.port';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { DevHoldingsPort } from 'holders/domain/holdings.port';
import { OnchainSolanaReaderService } from 'provider/infrastructure/onchain/onchain-solana.reader';
import type { BondingCurveReading } from 'provider/infrastructure/onchain/onchain-solana.reader';
import {
  SNAPSHOT_QUOTE_PROVIDERS,
  emptySnapshotQuote,
  type SnapshotQuote,
} from '../domain/snapshot-quote.types';

/**
 * Bonding curve on the snapshot wire (`rick-compact-card` §10.16,
 * plumbing points 8-9): the FAN-OUT leg (`getPumpCurve`) fills
 * `snapshot.bondingCurve` for Solana `kind=token` only, fail-open on
 * every miss. Replays (SWR-now, stale) serve the curve PERSISTED in
 * `snapshot_history.quote` only while the row is inside the replay
 * freshness bound — see `address-snapshot-bonding-curve-replay.spec.ts`
 * for that policy (this suite covers the live fan-out leg).
 *
 * All adapters are stubbed — zero network.
 */
const CHAIN = 'solana';
const MINT = '2o1wthqgEbeLr3Lxv4LtBYHtFTbMK4TmSr9U5RsPpump';
const input = { chain: CHAIN, value: MINT, kindHint: 'token' as const };
const key = `${CHAIN}:${MINT.toLowerCase()}`;

const READING: BondingCurveReading = {
  poolAddress: '5sqQd6fn8FqNkRerAYcz2gewDd97JHe9fvGASwRqQiCC',
  onCurve: true,
  launchpadId: 'pump-fun',
  quoteSymbol: 'Bitcoin',
  quoteMint: 'HytpiyuR3sVXGB5UqoqrnThCPH2X1tWVm5neep3Dpump',
  progressPercent: 65.69,
};

type CurveMode = 'reading' | 'null' | 'reject' | 'absent' | 'never';

interface HarnessOptions {
  readonly curve?: CurveMode;
  readonly mode?: 'ok' | 'fail';
  readonly chain?: string;
  readonly value?: string;
  readonly kindHint?: 'token' | 'wallet';
}

interface Harness {
  readonly snapshots: AddressSnapshotService;
  readonly history: SnapshotHistoryRepository;
  readonly reader: Record<string, unknown>;
  readonly curveCalls: () => number;
  readonly seedWarm: (ageMs: number) => Promise<string>;
}

const modules: TestingModule[] = [];

function buildReader(options: HarnessOptions): {
  reader: Record<string, unknown>;
  curveCalls: () => number;
} {
  const calls = { count: 0 };
  const reader: Record<string, unknown> = {
    getPoolView: async () => null,
    getTokenBasics: async () => null,
  };
  const curve = options.curve ?? 'reading';
  if (curve !== 'absent') {
    reader['getPumpCurve'] = async () => {
      calls.count += 1;
      if (curve === 'reject') throw new Error('curve rpc down');
      if (curve === 'never')
        return new Promise<BondingCurveReading | null>(() => {});
      return curve === 'null' ? null : READING;
    };
  }
  return { reader, curveCalls: () => calls.count };
}

async function harness(options: HarnessOptions = {}): Promise<Harness> {
  const chain = options.chain ?? CHAIN;
  const value = options.value ?? MINT;
  const { reader, curveCalls } = buildReader(options);
  const fetcher = {
    name: 'stub-native',
    supportsChains: [CHAIN, 'ethereum'],
    fetch: async (): Promise<Partial<SnapshotQuote> | null> => {
      if (options.mode === 'fail') throw new Error('stub down');
      return {
        priceUsd: 1,
        priceChange24h: 0,
        symbol: 'MINT',
        name: 'Mint',
      };
    },
  };
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      CacheModule,
      SnapshotModule,
    ],
  })
    .overrideProvider(SNAPSHOT_QUOTE_PROVIDERS)
    .useValue([fetcher])
    .overrideProvider(LaunchpadDetectorService)
    .useValue({ detectLaunchpad: async () => null })
    .overrideProvider(DirectFastPathService)
    .useValue({ tryResolve: async () => null })
    .overrideProvider(OnchainSolanaReaderService)
    .useValue(reader)
    .overrideProvider(ChainCatalogPort)
    .useValue({
      findById: async (id: string) => ({
        id: (id ?? '').trim().toLowerCase(),
        family: (id ?? '').trim().toLowerCase() === 'solana' ? 'SOLANA' : 'EVM',
        displayName: id,
        nativeSymbol: 'T',
        explorerUrl: null,
        geckoTerminalSlug: id,
        logoUrl: '',
      }),
      listAll: async () => [],
      listByFamily: async () => [],
    })
    .overrideProvider(DexScreenerService)
    .useValue({
      getBestPairSummary: async () => null,
      getBestPairSummaryForChain: async () => null,
    })
    .overrideProvider(GeckoTerminalService)
    .useValue({
      getTokenPools: async () => null,
      searchPools: async () => null,
      getPoolOhlcv: async () => null,
      getPoolOhlcvDay: async () => null,
    })
    .overrideProvider(BirdeyeService)
    .useValue({ getTokenOhlcv: async () => null })
    .overrideProvider(DevHoldingsPort)
    .useValue({ resolve: async () => null })
    .overrideProvider(AddressExistenceService)
    .useValue({
      probe: async () => ({
        verdict: 'unresolved',
        reason: 'spec stub (fail-open)',
        ms: 1,
      }),
    })
    .compile();
  modules.push(module);
  const history = module.get(SnapshotHistoryRepository);
  return {
    snapshots: module.get(AddressSnapshotService),
    history,
    reader,
    curveCalls,
    seedWarm: async (ageMs: number) => {
      const createdAt = new Date(Date.now() - ageMs).toISOString();
      const saved = await history.saveSeeded({
        key,
        chain,
        address: value.toLowerCase(),
        kind: 'token',
        status: 'ready',
        quote: {
          ...emptySnapshotQuote(),
          priceUsd: 1,
          fdvUsd: 1_000,
          fdvProvenance: 'computed',
        },
        sources: ['stub-native'],
        providerErrors: {},
        createdAt,
      });
      expect(saved).not.toBeNull();
      return createdAt;
    },
  };
}

afterEach(async () => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  while (modules.length > 0) {
    const module = modules.pop();
    if (module !== undefined) await module.close();
  }
});

describe('AddressSnapshotService bondingCurve — fan-out leg (§10.16)', () => {
  it('maps the pump-curve reading onto the five-field wire object', async () => {
    const h = await harness({ curve: 'reading' });
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.bondingCurve).toEqual({
      onCurve: true,
      launchpadId: 'pump-fun',
      quoteSymbol: 'Bitcoin',
      quoteMint: 'HytpiyuR3sVXGB5UqoqrnThCPH2X1tWVm5neep3Dpump',
      progressPercent: 65.69,
    });
    // `poolAddress` is NOT part of the wire shape (pinned).
    expect(snapshot.bondingCurve).not.toHaveProperty('poolAddress');
    expect(h.curveCalls()).toBe(1);
  });

  it('null reading => bondingCurve null (graduated / not on curve)', async () => {
    const h = await harness({ curve: 'null' });
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.bondingCurve).toBeNull();
    expect(h.curveCalls()).toBe(1);
  });

  it('rejecting getPumpCurve fails open (null) and the card still serves', async () => {
    const h = await harness({ curve: 'reject' });
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.priceUsd).toBe(1);
    expect(snapshot.bondingCurve).toBeNull();
    expect(h.curveCalls()).toBe(1);
  });

  it('missing method on the stub: zero asks, bondingCurve null (optional guard)', async () => {
    const h = await harness({ curve: 'absent' });
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.bondingCurve).toBeNull();
    // The guard skipped before any invocation was possible.
    expect('getPumpCurve' in h.reader).toBe(false);
    expect(h.curveCalls()).toBe(0);
  });

  it('non-solana chain never calls getPumpCurve', async () => {
    const h = await harness({
      curve: 'reading',
      chain: 'ethereum',
      value: '0x1111111111111111111111111111111111111111',
    });
    const snapshot = await h.snapshots.getSnapshot({
      chain: 'ethereum',
      value: '0x1111111111111111111111111111111111111111',
      kindHint: 'token',
    });
    expect(snapshot.bondingCurve).toBeNull();
    expect(h.curveCalls()).toBe(0);
  });

  it('kind !== token never calls getPumpCurve', async () => {
    const h = await harness({ curve: 'reading', kindHint: 'wallet' });
    const snapshot = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: MINT,
      kindHint: 'wallet',
    });
    expect(snapshot.bondingCurve).toBeNull();
    expect(h.curveCalls()).toBe(0);
  });

  it('never-resolving getPumpCurve rides the budget and still serves null', async () => {
    const h = await harness({ curve: 'never' });
    jest.useFakeTimers();
    const pending = h.snapshots.getSnapshot(input);
    await jest.advanceTimersByTimeAsync(SNAPSHOT_PUMP_CURVE_TIMEOUT_MS);
    const snapshot = await pending;
    expect(snapshot.status).toBe('ready');
    expect(snapshot.bondingCurve).toBeNull();
    expect(h.curveCalls()).toBe(1);
  });

  it('stale replay serves null when the row carries no persisted curve', async () => {
    // 10s-old row: below the SWR floor (30s), so this flows through the
    // fan-out -> all-fail -> stale-floor replay. The seeded quote has
    // `bondingCurve: null` (legacy shape) — the replay bound serves null.
    const h = await harness({ curve: 'reading', mode: 'fail' });
    await h.seedWarm(10_000);
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.stale).toBe(true);
    expect(snapshot.bondingCurve).toBeNull();
  });

  it('SWR-now serves null for a curve-less row; the refresh recomputes it', async () => {
    // 60s-old row: inside [SWR floor, stale bound) -> SWR serve. The
    // row has no persisted curve, so the replay answers null. The
    // background refresh now COMPUTES the curve (replay follow-up), so
    // the next replay can render the short layout.
    const h = await harness({ curve: 'reading' });
    await h.seedWarm(60_000);
    const snapshot = await h.snapshots.getSnapshot(input);
    expect(snapshot.stale).toBe(true);
    expect(snapshot.bondingCurve).toBeNull();
    await h.snapshots.backgroundRefreshHandle();
    expect(h.curveCalls()).toBe(1);
  });
});
