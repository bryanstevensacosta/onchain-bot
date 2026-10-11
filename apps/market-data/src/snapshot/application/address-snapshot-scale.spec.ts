import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AddressSnapshotService } from './address-snapshot.service';
import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import { SingleflightService } from './singleflight.service';
import { QuotaGovernorService } from './quota-governor.service';
import { isStaleTrioValid } from '../domain/snapshot-ttl-policy';
import {
  emptySnapshotQuote,
  type QuoteFetcher,
} from '../domain/snapshot-quote.types';

const ADDRESS = 'So11111111111111111111111111111111111111112';
const INPUT = { chain: 'solana', value: ADDRESS };

function countingReadyFetcher(counter: { calls: number }): QuoteFetcher {
  return {
    name: 'dexscreener',
    supportsChains: ['solana'],
    fetch: async () => {
      counter.calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return { symbol: 'WIF', name: 'dogwifhat', priceUsd: 1.5 };
    },
  };
}

function buildService(args: {
  readonly fetchers: ReadonlyArray<QuoteFetcher>;
  readonly cache?: {
    readonly get: jest.Mock;
    readonly set: jest.Mock;
  } | null;
  readonly history?: SnapshotHistoryRepository;
  readonly launchpad?: unknown;
  readonly singleflight?: SingleflightService | null;
  readonly governor?: QuotaGovernorService | null;
}): {
  readonly service: AddressSnapshotService;
  readonly history: SnapshotHistoryRepository;
  readonly cache: { readonly get: jest.Mock; readonly set: jest.Mock };
} {
  const catalog = {
    findById: async (id: string) => (id === 'solana' ? { id } : null),
  };
  const registry = {
    listProviders: () => [
      { name: 'dexscreener', supportsChains: ['solana'] },
      { name: 'birdeye', supportsChains: ['solana'] },
    ],
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
  };
  const kinds = {
    detect: async () => 'token' as const,
  };
  const cache = args.cache ?? {
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
  };
  const history = args.history ?? new SnapshotHistoryRepository();
  const service = new AddressSnapshotService(
    catalog as never,
    registry as never,
    kinds as never,
    new SnapshotAggregatorService(),
    history,
    args.fetchers,
    cache as never,
    null,
    null,
    null,
    null,
    args.launchpad ?? null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    args.singleflight ?? null,
    args.governor ?? null,
  );
  return { service, history, cache };
}

describe('free-scale integration (plan todo 41: singleflight + governor + degraded)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('collapses N concurrent same-key snapshots into ONE upstream fan-out', async () => {
    const counter = { calls: 0 };
    const { service, history } = buildService({
      fetchers: [countingReadyFetcher(counter)],
      singleflight: new SingleflightService(),
    });
    const results = await Promise.all(
      Array.from({ length: 5 }, () => service.getSnapshot(INPUT)),
    );
    expect(counter.calls).toBe(1);
    expect(await history.count()).toBe(1);
    for (const result of results) {
      expect(result.status).toBe('ready');
      expect(result.symbol).toBe('WIF');
      expect(result.degraded).toBe(false);
      expect(
        isStaleTrioValid(result.stale, result.staleAsOf, result.staleAgeMs),
      ).toBe(true);
    }
  });

  it('sheds Tier-2 under governor pressure with an auditable providerErrors key', async () => {
    const governor = new QuotaGovernorService();
    const now = Date.now();
    // Drive 30 MISS/min through the same window (L1 threshold).
    for (let i = 0; i < 30; i += 1) {
      governor.evaluate(0, now);
    }
    const birdeyeFetch = jest.fn(async () => null);
    const { service } = buildService({
      fetchers: [
        countingReadyFetcher({ calls: 0 }),
        {
          name: 'birdeye',
          supportsChains: ['solana'],
          fetch: birdeyeFetch,
        },
      ],
      governor,
    });
    const snapshot = await service.getSnapshot(INPUT);
    expect(birdeyeFetch).not.toHaveBeenCalled();
    expect(snapshot.status).toBe('ready');
    expect(snapshot.providerErrors['governor:shed-tier-2']).toMatch(
      /skipped birdeye at pressure L1/,
    );
    expect(snapshot.degraded).toBe(false);
  });

  it('marks tail-degraded cards end-to-end AND caches them with the bit set', async () => {
    const hangingLaunchpad = {
      detectLaunchpad: () => new Promise<null>(() => {}),
    };
    const { service, cache } = buildService({
      fetchers: [countingReadyFetcher({ calls: 0 })],
      launchpad: hangingLaunchpad,
    });
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.degraded).toBe(true);
    expect(snapshot.providerErrors['tail:launchpad']).toMatch(
      /degraded to null/,
    );
    // Degraded-ready IS cached (30s numbers TTL — the bit IS the
    // honesty, unlike stale replays which must never cache).
    expect(cache.set).toHaveBeenCalledTimes(1);
    const written = cache.set.mock.calls[0][1] as { degraded: boolean };
    expect(written.degraded).toBe(true);
  }, 15_000);

  it('serves a stale replay with a valid trio and keeps the trio off fresh cards', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save({
      key: `solana:${ADDRESS.toLowerCase()}`,
      chain: 'solana',
      address: ADDRESS.toLowerCase(),
      kind: 'token',
      status: 'ready',
      quote: {
        ...emptySnapshotQuote(),
        symbol: 'WIF',
        name: 'dogwifhat',
        priceUsd: 1.5,
      },
      sources: ['dexscreener'],
      providerErrors: {},
    });
    const failing: QuoteFetcher = {
      name: 'dexscreener',
      supportsChains: ['solana'],
      fetch: async () => {
        throw new Error('down');
      },
    };
    const { service, cache } = buildService({ fetchers: [failing], history });
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 60_000);
    const stale = await service.getSnapshot(INPUT);
    expect(stale.status).toBe('ready');
    expect(stale.stale).toBe(true);
    expect(
      isStaleTrioValid(stale.stale, stale.staleAsOf, stale.staleAgeMs),
    ).toBe(true);
    expect(stale.staleAgeMs).toBeGreaterThanOrEqual(60_000);
    expect(stale.staleAgeMs).toBeLessThan(61_000);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('reads the governor at exactly ONE point (getSnapshot pre-fan-out; edges check nothing)', () => {
    const src = join(__dirname, '..', '..');
    const service = readFileSync(
      join(src, 'snapshot/application/address-snapshot.service.ts'),
      'utf8',
    );
    expect(service.match(/this\.governor\.evaluate\(/g) ?? []).toHaveLength(1);
    for (const edge of [
      'gateway/infrastructure/http/market-data-snapshot.controller.ts',
      'gateway/infrastructure/http/addresses.controller.ts',
      'gateway/infrastructure/http/addresses-batch.controller.ts',
    ]) {
      expect(readFileSync(join(src, edge), 'utf8')).not.toContain(
        'QuotaGovernor',
      );
    }
  });
});
