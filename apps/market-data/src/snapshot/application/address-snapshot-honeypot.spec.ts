import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SnapshotModule } from '../snapshot.module';
import { AddressSnapshotService } from './address-snapshot.service';
import {
  DirectFastPathService,
  type DirectFastPathResult,
} from './direct-fast-path.service';
import { AddressExistenceService } from './address-existence.service';
import { CacheModule } from 'cache/cache.module';
import { CacheService } from 'cache/application/cache.service';
import { LaunchpadDetectorService } from 'launchpad/application/launchpad-detector.service';
import { ChainCatalogPort } from 'chain/application/ports/chain-catalog.port';
import { DexScreenerService } from 'provider/infrastructure/dexscreener';
import { GeckoTerminalService } from 'provider/infrastructure/geckoterminal';
import { BirdeyeService } from 'provider/infrastructure/birdeye';
import { GoplusService } from 'provider/infrastructure/goplus';
import {
  SNAPSHOT_QUOTE_PROVIDERS,
  emptySnapshotQuote,
} from '../domain/snapshot-quote.types';
import {
  classifyTokenSecurity,
  HONEYPOT_TRANSIENT_NOTE,
} from '../domain/snapshot-honeypot';

/**
 * Honeypot snapshot acceptance matrix (dexter plan todo 71 + D1/D3).
 * All adapters stubbed — ZERO network. Pins the end-to-end contract
 * dexter's `toHoneypotOrNull` consumes:
 *
 * - fraction strings -> PERCENT (`{buy:4,sell:2,sim:null}`),
 * - entry present with tax keys absent -> both nulls (probed/no-data),
 * - SIM verdict (`is_honeypot` present and 0 -> `ok`),
 * - LP lock/burn propagated to `lockedLiquidityPercent`/`burnedPercent`
 *   (null-only merge — a real provider value wins),
 * - `SNAPSHOT_SIM_VERDICT_ENABLED=false` -> `sim:null` only (taxes and
 *   lock intact),
 * - `code:2022` -> definitive absence (no field, no note, memoized),
 * - transient -> no field + `degraded` + `tail:honeypot` note, NEVER
 *   memoized (retries next request),
 * - timeout -> `tail budget 1500ms` note (dedicated slow-leg budget,
 *   out of the shared 400ms race), never memoized,
 * - chain gate (robinhood/solana) -> SILENT: no call, no field, no note,
 * - kind != token -> silent,
 * - fast path -> `honeypot:fast-path` note (degraded), no call,
 * - kill-switch OFF -> silent.
 */

const CHAIN = 'bsc';
const SAFEMOONCASH = '0xF017E2773e4ee0590C81D79ccbcF1B2De1D22877';
const CAKE = '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82';
const KODA = '0xd3775c4D5C517AaCAe0CCF906DCD96713b5749cF';
const NYMA = '0x968Be0c1A394Bf1cE239E3b40909eC0F9d4f5583';

const SAFEMOONCASH_BODY = {
  code: 1,
  message: 'OK',
  result: {
    [SAFEMOONCASH.toLowerCase()]: { buy_tax: '0.04', sell_tax: '0.02' },
  },
};

const CAKE_BODY = {
  code: 1,
  message: 'OK',
  result: { [CAKE.toLowerCase()]: {} },
};

/** Live KODA BSC witness (2026-10-22): SIM ok + PinkLock ~100% + null 0%. */
const KODA_BODY = {
  code: 1,
  message: 'OK',
  result: {
    [KODA.toLowerCase()]: {
      is_honeypot: '0',
      cannot_buy: '0',
      cannot_sell_all: '0',
      buy_tax: '0',
      sell_tax: '0.0297',
      lp_holders: [
        {
          address: '0x407993575c91ce7643a4d4ccacc9a98c36ee1bbe',
          percent: '0.999999999999999999',
          is_locked: 1,
        },
        {
          address: '0x0000000000000000000000000000000000000000',
          percent: '0',
          is_locked: 1,
        },
      ],
    },
  },
};

type ProbeStep =
  | { readonly kind: 'body'; readonly body: unknown }
  | { readonly kind: 'transient' }
  | { readonly kind: 'hang' };

interface HarnessOptions {
  readonly chain?: string;

  /** `false` sets the kill-switch env before module construction. */
  readonly enabled?: boolean;
  /** `false` sets `SNAPSHOT_SIM_VERDICT_ENABLED` before module construction. */
  readonly simVerdict?: boolean;
  /** Sets `SNAPSHOT_HONEYPOT_TIMEOUT_MS` before module construction. */
  readonly timeoutMs?: number;
  /** Per-call fake answers (default: SAFEMOONCASH body). */
  readonly steps?: ReadonlyArray<ProbeStep>;
  /** `true` makes the direct fast path serve (skipHoneypot branch). */
  readonly fast?: boolean;
  /** Quote fields the stubbed fan-out fetcher contributes (lock merge pins). */
  readonly lockedLiquidityPercent?: number;
  readonly burnedPercent?: number;
}

interface Harness {
  readonly snapshots: AddressSnapshotService;
  readonly cache: CacheService;
  readonly calls: Array<{ chainId: number; address: string }>;
}

const modules: TestingModule[] = [];

const snapshotCacheKey = (
  chain: string,
  address: string,
  kind: string,
): string => `snapshot:${chain}:${address.toLowerCase()}:${kind}`;

function fastResult(): DirectFastPathResult {
  return {
    outcome: {
      quote: { ...emptySnapshotQuote(), priceUsd: 1, priceChange24h: 0 },
      sources: ['onchain-direct'],
      errors: {},
      allFailed: false,
    },
    venue: null,
    pairCreatedAt: null,
    pairAddress: null,
    pairSide: null,
    launchpad: null,
    timings: {
      discoveryMs: null,
      directMs: 1,
      launchpadMs: null,
      totalMs: 1,
      v2Ms: null,
      v3Ms: null,
      anchorMs: null,
    },
  };
}

async function harness(options: HarnessOptions = {}): Promise<Harness> {
  const chain = options.chain ?? CHAIN;
  const steps = options.steps ?? [];
  const calls: Array<{ chainId: number; address: string }> = [];
  const previousKillSwitch = process.env['SNAPSHOT_HONEYPOT_ENABLED'];
  const previousSimSwitch = process.env['SNAPSHOT_SIM_VERDICT_ENABLED'];
  const previousTimeout = process.env['SNAPSHOT_HONEYPOT_TIMEOUT_MS'];
  if (options.enabled === undefined) {
    delete process.env['SNAPSHOT_HONEYPOT_ENABLED'];
  } else {
    process.env['SNAPSHOT_HONEYPOT_ENABLED'] = options.enabled ? '1' : '0';
  }
  if (options.simVerdict === undefined) {
    delete process.env['SNAPSHOT_SIM_VERDICT_ENABLED'];
  } else {
    process.env['SNAPSHOT_SIM_VERDICT_ENABLED'] = options.simVerdict
      ? '1'
      : '0';
  }
  if (options.timeoutMs === undefined) {
    delete process.env['SNAPSHOT_HONEYPOT_TIMEOUT_MS'];
  } else {
    process.env['SNAPSHOT_HONEYPOT_TIMEOUT_MS'] = String(options.timeoutMs);
  }
  let module: TestingModule;
  try {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        CacheModule,
        SnapshotModule,
      ],
    })
      .overrideProvider(SNAPSHOT_QUOTE_PROVIDERS)
      .useValue([
        {
          name: 'stub-native',
          supportsChains: [chain],
          fetch: async () => ({
            priceUsd: 2,
            // Native change present -> the OHLC derivation leg stays OFF
            // (zero extra network, deterministic tails).
            priceChange24h: 0,
            totalSupply: 1_000,
            maxSupply: null,
            lockedLiquidityPercent: options.lockedLiquidityPercent ?? null,
            burnedPercent: options.burnedPercent ?? null,
          }),
        },
      ])
      .overrideProvider(LaunchpadDetectorService)
      .useValue({ detectLaunchpad: async () => null })
      .overrideProvider(DirectFastPathService)
      .useValue({
        tryResolve: async () => (options.fast === true ? fastResult() : null),
      })
      .overrideProvider(ChainCatalogPort)
      .useValue({
        findById: async (id: string) => ({
          id: (id ?? '').trim().toLowerCase(),
          family:
            (id ?? '').trim().toLowerCase() === 'solana' ? 'SOLANA' : 'EVM',
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
      .overrideProvider(AddressExistenceService)
      .useValue({
        probe: async () => ({
          verdict: 'unresolved',
          reason: 'spec stub (fail-open)',
          ms: 0,
        }),
      })
      // Fake GoPlus: records calls and feeds envelopes through the REAL
      // classifier (wire shape pinned by the domain spec).
      .overrideProvider(GoplusService)
      .useValue({
        getTokenSecurity: async (chainId: number, address: string) => {
          calls.push({ chainId, address });
          const step = steps[calls.length - 1];
          if (step === undefined) {
            return classifyTokenSecurity(SAFEMOONCASH_BODY, address);
          }
          if (step.kind === 'hang') return new Promise(() => {});
          if (step.kind === 'transient') return { kind: 'transient' };
          return classifyTokenSecurity(step.body, address);
        },
      })
      .compile();
  } finally {
    // The kill-switch/budget field initializers already ran (module
    // construct); restore the ambient env for the rest of the suite.
    if (previousKillSwitch === undefined) {
      delete process.env['SNAPSHOT_HONEYPOT_ENABLED'];
    } else {
      process.env['SNAPSHOT_HONEYPOT_ENABLED'] = previousKillSwitch;
    }
    if (previousSimSwitch === undefined) {
      delete process.env['SNAPSHOT_SIM_VERDICT_ENABLED'];
    } else {
      process.env['SNAPSHOT_SIM_VERDICT_ENABLED'] = previousSimSwitch;
    }
    if (previousTimeout === undefined) {
      delete process.env['SNAPSHOT_HONEYPOT_TIMEOUT_MS'];
    } else {
      process.env['SNAPSHOT_HONEYPOT_TIMEOUT_MS'] = previousTimeout;
    }
  }
  modules.push(module);
  return {
    snapshots: module.get(AddressSnapshotService),
    cache: module.get(CacheService),
    calls,
  };
}

afterEach(async () => {
  jest.restoreAllMocks();
  while (modules.length > 0) {
    const module = modules.pop();
    if (module !== undefined) await module.close();
  }
});

describe('AddressSnapshotService honeypot leg (todo 71 — GoPlus Fase 1)', () => {
  it('SAFEMOONCASH bsc: fraction strings -> {buy:4,sell:2,sim:null}', async () => {
    const h = await harness();
    const snapshot = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: SAFEMOONCASH,
      kindHint: 'token',
    });
    expect(snapshot.honeypot).toEqual({ buy: 4, sell: 2, sim: null });
    expect(snapshot.degraded).toBe(false);
    expect(snapshot.providerErrors['tail:honeypot']).toBeUndefined();
    expect(h.calls).toEqual([{ chainId: 56, address: SAFEMOONCASH }]);
  });

  it('CAKE bsc: entry present with tax keys absent -> both nulls (probed, no data)', async () => {
    const h = await harness({
      steps: [{ kind: 'body', body: CAKE_BODY }],
    });
    const snapshot = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: CAKE,
      kindHint: 'token',
    });
    expect(snapshot.honeypot).toEqual({ buy: null, sell: null, sim: null });
    expect(snapshot.degraded).toBe(false);
    expect(h.calls).toHaveLength(1);
  });

  it('KODA bsc: SIM ok + taxes 0/2.97 + lock 100/0 propagated from the same call', async () => {
    const h = await harness({
      steps: [{ kind: 'body', body: KODA_BODY }],
    });
    const snapshot = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: KODA,
      kindHint: 'token',
    });
    // Wire shape stays `{buy,sell,sim}` — the lock rides BESIDE it.
    expect(snapshot.honeypot).toEqual({ buy: 0, sell: 2.97, sim: 'ok' });
    expect(snapshot.lockedLiquidityPercent).toBe(100);
    expect(snapshot.burnedPercent).toBe(0);
    expect(snapshot.degraded).toBe(false);
    expect(h.calls).toEqual([{ chainId: 56, address: KODA }]);
  });

  it('SNAPSHOT_SIM_VERDICT_ENABLED=false: sim null, taxes AND lock intact', async () => {
    const h = await harness({
      simVerdict: false,
      steps: [{ kind: 'body', body: KODA_BODY }],
    });
    const snapshot = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: KODA,
      kindHint: 'token',
    });
    expect(snapshot.honeypot).toEqual({ buy: 0, sell: 2.97, sim: null });
    expect(snapshot.lockedLiquidityPercent).toBe(100);
    expect(snapshot.burnedPercent).toBe(0);
    // The kill-switch is telemetry-neutral: the call still happens.
    expect(h.calls).toHaveLength(1);
    expect(snapshot.degraded).toBe(false);
  });

  it('lock merge is null-only: a real provider value is never overwritten', async () => {
    const h = await harness({
      lockedLiquidityPercent: 42,
      burnedPercent: 7,
      steps: [{ kind: 'body', body: KODA_BODY }],
    });
    const snapshot = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: KODA,
      kindHint: 'token',
    });
    expect(snapshot.lockedLiquidityPercent).toBe(42);
    expect(snapshot.burnedPercent).toBe(7);
  });

  it('lpLock null (no lp_holders): both columns stay null', async () => {
    const h = await harness({
      steps: [{ kind: 'body', body: SAFEMOONCASH_BODY }],
    });
    const snapshot = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: SAFEMOONCASH,
      kindHint: 'token',
    });
    expect(snapshot.lockedLiquidityPercent).toBeNull();
    expect(snapshot.burnedPercent).toBeNull();
  });

  it('body code 2022 = definitive absence: no field, no note, memoized', async () => {
    const h = await harness({
      steps: [{ kind: 'body', body: { code: 2022, result: null } }],
    });
    const first = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: SAFEMOONCASH,
      kindHint: 'token',
    });
    expect(first.honeypot).toBeNull();
    expect(first.degraded).toBe(false);
    expect(first.providerErrors['tail:honeypot']).toBeUndefined();
    expect(h.calls).toHaveLength(1);
    // Bypass the 30s card cache to prove the MEMO suppressed the 2nd call
    // (the default fake would answer a reading on a retry).
    await h.cache.del(snapshotCacheKey(CHAIN, SAFEMOONCASH, 'token'));
    const second = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: SAFEMOONCASH,
      kindHint: 'token',
    });
    expect(second.honeypot).toBeNull();
    expect(h.calls).toHaveLength(1);
  });

  it('transient failure: no field + degraded + tail note, NEVER memoized (retries next request)', async () => {
    const h = await harness({
      steps: [{ kind: 'transient' }, { kind: 'body', body: SAFEMOONCASH_BODY }],
    });
    const first = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: SAFEMOONCASH,
      kindHint: 'token',
    });
    expect(first.honeypot).toBeNull();
    expect(first.degraded).toBe(true);
    expect(first.providerErrors['tail:honeypot']).toBe(HONEYPOT_TRANSIENT_NOTE);
    await h.cache.del(snapshotCacheKey(CHAIN, SAFEMOONCASH, 'token'));
    const second = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: SAFEMOONCASH,
      kindHint: 'token',
    });
    expect(second.honeypot).toEqual({ buy: 4, sell: 2, sim: null });
    expect(second.degraded).toBe(false);
    expect(h.calls).toHaveLength(2);
  });

  it('timeout: dedicated tail budget note (1500ms) + degraded, retried next request (never memoized)', async () => {
    const h = await harness({
      steps: [{ kind: 'hang' }, { kind: 'body', body: SAFEMOONCASH_BODY }],
    });
    const first = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: SAFEMOONCASH,
      kindHint: 'token',
    });
    expect(first.honeypot).toBeNull();
    expect(first.degraded).toBe(true);
    expect(first.providerErrors['tail:honeypot']).toContain(
      'timeout (tail budget 1500ms)',
    );
    await h.cache.del(snapshotCacheKey(CHAIN, SAFEMOONCASH, 'token'));
    const second = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: SAFEMOONCASH,
      kindHint: 'token',
    });
    expect(second.honeypot).toEqual({ buy: 4, sell: 2, sim: null });
    expect(h.calls).toHaveLength(2);
  });

  it('fake-timer window: survives 500ms (out of the old 400ms race) and settles past 1500ms', async () => {
    jest.useFakeTimers();
    try {
      const h = await harness({ steps: [{ kind: 'hang' }] });
      const pending = h.snapshots.getSnapshot({
        chain: CHAIN,
        value: SAFEMOONCASH,
        kindHint: 'token',
      });
      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      // Flush microtasks so the pipeline reaches the guard timer.
      await jest.advanceTimersByTimeAsync(0);
      // The OLD shared 400ms budget would have degraded the leg by now;
      // the dedicated 1500ms budget is still waiting at the 500ms mark.
      await jest.advanceTimersByTimeAsync(500);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(1_100);
      const snapshot = await pending;
      expect(settled).toBe(true);
      expect(snapshot.honeypot).toBeNull();
      expect(snapshot.degraded).toBe(true);
      expect(snapshot.providerErrors['tail:honeypot']).toContain(
        'timeout (tail budget 1500ms)',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('env override SNAPSHOT_HONEYPOT_TIMEOUT_MS=700 governs the wait and the note name', async () => {
    jest.useFakeTimers();
    try {
      const h = await harness({ timeoutMs: 700, steps: [{ kind: 'hang' }] });
      const pending = h.snapshots.getSnapshot({
        chain: CHAIN,
        value: SAFEMOONCASH,
        kindHint: 'token',
      });
      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      await jest.advanceTimersByTimeAsync(0);
      await jest.advanceTimersByTimeAsync(500);
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(300);
      const snapshot = await pending;
      expect(snapshot.honeypot).toBeNull();
      expect(snapshot.providerErrors['tail:honeypot']).toContain(
        'timeout (tail budget 700ms)',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('chain gate: robinhood (no GoPlus id) stays SILENT — zero calls, no field, no note', async () => {
    const h = await harness({ chain: 'robinhood' });
    const snapshot = await h.snapshots.getSnapshot({
      chain: 'robinhood',
      value: NYMA,
      kindHint: 'token',
    });
    expect(snapshot.honeypot).toBeNull();
    expect(snapshot.degraded).toBe(false);
    expect(snapshot.providerErrors['tail:honeypot']).toBeUndefined();
    expect(snapshot.providerErrors['honeypot:fast-path']).toBeUndefined();
    expect(h.calls).toHaveLength(0);
  });

  it('chain gate on the fast path: solana stays silent (no honeypot:fast-path note)', async () => {
    const h = await harness({ chain: 'solana', fast: true });
    const snapshot = await h.snapshots.getSnapshot({
      chain: 'solana',
      value: 'So11111111111111111111111111111111111111112',
      kindHint: 'token',
    });
    expect(snapshot.honeypot).toBeNull();
    expect(snapshot.providerErrors['honeypot:fast-path']).toBeUndefined();
    // `degraded` is true for the UNRELATED dev-holdings fast-path skip —
    // the honeypot leg itself must contribute nothing on unmapped chains.
    expect(snapshot.providerErrors['dev:fast-path']).toBe(
      'skipped (fast-path budget)',
    );
    expect(snapshot.providerErrors['tail:honeypot']).toBeUndefined();
    expect(h.calls).toHaveLength(0);
  });

  it('kind != token skips the leg silently (wallet)', async () => {
    const h = await harness();
    const snapshot = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: SAFEMOONCASH,
      kindHint: 'wallet',
    });
    expect(snapshot.honeypot).toBeNull();
    expect(snapshot.providerErrors['tail:honeypot']).toBeUndefined();
    expect(snapshot.degraded).toBe(false);
    expect(h.calls).toHaveLength(0);
  });

  it('fast path on a mapped chain: honeypot:fast-path note + degraded, zero calls', async () => {
    const h = await harness({ fast: true });
    const snapshot = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: SAFEMOONCASH,
      kindHint: 'token',
    });
    expect(snapshot.honeypot).toBeNull();
    expect(snapshot.providerErrors['honeypot:fast-path']).toBe(
      'skipped (fast-path budget)',
    );
    expect(snapshot.degraded).toBe(true);
    expect(h.calls).toHaveLength(0);
  });

  it('kill-switch OFF: no call AND no field (silence)', async () => {
    const h = await harness({ enabled: false });
    const snapshot = await h.snapshots.getSnapshot({
      chain: CHAIN,
      value: SAFEMOONCASH,
      kindHint: 'token',
    });
    expect(snapshot.honeypot).toBeNull();
    expect(snapshot.providerErrors['tail:honeypot']).toBeUndefined();
    expect(snapshot.providerErrors['honeypot:fast-path']).toBeUndefined();
    expect(snapshot.degraded).toBe(false);
    expect(h.calls).toHaveLength(0);
  });
});
