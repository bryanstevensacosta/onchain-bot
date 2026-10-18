import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import { DirectFastPathService } from './direct-fast-path.service';
import { AddressExistenceService } from './address-existence.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { ChainCatalogPort } from 'chain/application/ports/chain-catalog.port';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { DevHoldingsPort } from 'holders/domain/holdings.port';
import {
  SNAPSHOT_QUOTE_PROVIDERS,
  type SnapshotQuote,
} from '../domain/snapshot-quote.types';

/**
 * Rick-parity spot check (dexter plan todo 21 acceptance): the
 * `0x968B`-class requests must NEVER hang for ~10s — a dead token
 * answers a differentiated `invalid` in well under 1s (existence
 * gate), and a token whose providers hang answers an honest `pending`
 * bounded by the fan-out race deadline (`SNAPSHOT_FANOUT_DEADLINE_MS`
 * is pinned to 250ms here so the bound is measurable without waiting
 * the 4s default). All adapters stubbed — zero network.
 */
const CHAIN = 'robinhood';
const TOKEN = '0xAbCd000000000000000000000000000000000001';
const input = { chain: CHAIN, value: TOKEN, kindHint: 'token' as const };

type FetcherMode = 'ok' | 'fail' | 'hang';

interface FetcherState {
  mode: FetcherMode;
  calls: number;
}

interface ExistenceState {
  verdict: 'exists' | 'missing' | 'unresolved';
  reason: string;
  readonly calls: Array<{ chain: string; address: string; kind: string }>;
}

interface Harness {
  readonly snapshots: AddressSnapshotService;
  readonly history: SnapshotHistoryRepository;
  readonly fetchState: FetcherState;
  readonly existence: ExistenceState;
}

const modules: TestingModule[] = [];
const originalDeadline = process.env['SNAPSHOT_FANOUT_DEADLINE_MS'];

beforeEach(() => {
  // Never leak a test-scoped deadline into another spec's compile.
  delete process.env['SNAPSHOT_FANOUT_DEADLINE_MS'];
});

async function harness(): Promise<Harness> {
  const fetchState: FetcherState = { mode: 'ok', calls: 0 };
  const existence: ExistenceState = {
    verdict: 'unresolved',
    reason: 'spec stub (fail-open)',
    calls: [],
  };
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      SnapshotModule,
    ],
  })
    .overrideProvider(SNAPSHOT_QUOTE_PROVIDERS)
    .useValue([
      {
        name: 'stub-native',
        supportsChains: [CHAIN],
        fetch: async (): Promise<Partial<SnapshotQuote> | null> => {
          fetchState.calls += 1;
          if (fetchState.mode === 'fail') throw new Error('stub down');
          if (fetchState.mode === 'hang') {
            return new Promise<Partial<SnapshotQuote> | null>(() => {});
          }
          return { priceUsd: 2, priceChange24h: 0, totalSupply: 1_000 };
        },
      },
    ])
    .overrideProvider(LaunchpadDetectorService)
    .useValue({ detectLaunchpad: async () => null })
    .overrideProvider(DirectFastPathService)
    .useValue({ tryResolve: async () => null })
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
      probe: async (chain: string, address: string, kind: string) => {
        existence.calls.push({ chain, address, kind });
        return { verdict: existence.verdict, reason: existence.reason, ms: 1 };
      },
    })
    .compile();
  modules.push(module);
  return {
    snapshots: module.get(AddressSnapshotService),
    history: module.get(SnapshotHistoryRepository),
    fetchState,
    existence,
  };
}

afterEach(async () => {
  if (originalDeadline === undefined) {
    delete process.env['SNAPSHOT_FANOUT_DEADLINE_MS'];
  } else {
    process.env['SNAPSHOT_FANOUT_DEADLINE_MS'] = originalDeadline;
  }
  jest.restoreAllMocks();
  while (modules.length > 0) {
    const module = modules.pop();
    if (module !== undefined) await module.close();
  }
});

describe('AddressSnapshotService Rick-parity spot (todo 21 acceptance)', () => {
  it('answers a dead 0x968B-class token invalid in under 1s, without SWR or fan-out', async () => {
    const h = await harness();
    h.existence.verdict = 'missing';
    h.existence.reason = 'no contract bytecode (eth_getCode returned empty)';

    const started = Date.now();
    const snapshot = await h.snapshots.getSnapshot(input);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(1_000);
    expect(snapshot.status).toBe('invalid');
    expect(snapshot.priceUsd).toBeNull();
    expect(snapshot.providerErrors).toEqual({
      existence: 'no contract bytecode (eth_getCode returned empty)',
    });
    // No SWR note on a cold key, and no provider burn either.
    expect(snapshot.providerErrors['swr-now']).toBeUndefined();
    expect(h.fetchState.calls).toBe(0);
    expect(h.existence.calls).toHaveLength(1);
  });

  it('never hangs on a straggler: the fan-out race deadline bounds the serve', async () => {
    process.env['SNAPSHOT_FANOUT_DEADLINE_MS'] = '250';
    let h: Harness;
    try {
      h = await harness();
    } finally {
      delete process.env['SNAPSHOT_FANOUT_DEADLINE_MS'];
    }
    h.fetchState.mode = 'hang';

    const started = Date.now();
    const snapshot = await h.snapshots.getSnapshot(input);
    const elapsed = Date.now() - started;

    // Bounded by the 250ms deadline (not the 4s default, not 10s).
    expect(elapsed).toBeGreaterThanOrEqual(200);
    expect(elapsed).toBeLessThan(1_500);
    expect(snapshot.status).toBe('pending');
    expect(snapshot.stale).toBe(false);
    expect(snapshot.priceUsd).toBeNull();
    expect(snapshot.providerErrors).toEqual({
      'stub-native': 'abandoned at fanout deadline (250ms) — fail-open',
    });
    // The probe was UNRESOLVED — fail-open, no existence note.
    expect(snapshot.providerErrors['existence']).toBeUndefined();
    expect(h.fetchState.calls).toBe(1);
  });
});
