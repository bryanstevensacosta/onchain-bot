import {
  AddressSnapshotService,
  runTailCapped,
  SNAPSHOT_TAIL_CONCURRENCY,
  SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS,
} from './address-snapshot.service';
import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import type { QuoteFetcher } from '../domain/snapshot-quote.types';

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function healthyFetcher(name: string): QuoteFetcher {
  return {
    name,
    supportsChains: ['solana'],
    fetch: async () => ({ priceUsd: 2.5, symbol: 'WIF' }),
  };
}

interface TailHarness {
  service: AddressSnapshotService;
  started: Record<string, number[]>;
}

function buildService(delays: {
  launchpadMs: number;
  venueMs: number;
  devMs: number;
  launchpadThrows?: boolean;
}): TailHarness {
  const started: Record<string, number[]> = {
    launchpad: [],
    venue: [],
    dev: [],
  };
  const stamp = (name: string): void => {
    started[name].push(Date.now());
  };
  const launchpad = {
    detectLaunchpad: async () => {
      stamp('launchpad');
      await sleep(delays.launchpadMs);
      if (delays.launchpadThrows === true) {
        throw new Error('detector down');
      }
      return { id: 'pump-fun', name: 'Pump.fun' } as never;
    },
  };
  const dexscreener = {
    getBestPairSummaryForChain: async () => {
      stamp('venue');
      await sleep(delays.venueMs);
      return { dexId: 'raydium', labels: ['CLMM'] };
    },
  };
  const devHoldings = {
    resolve: async () => {
      stamp('dev');
      await sleep(delays.devMs);
      return {
        devWallets: [],
        devPctSupply: 1.5,
        source: 'birdeye',
        providerErrors: {},
      };
    },
  };
  const catalog = { findById: async (id: string) => ({ id }) };
  const providers = {
    listProviders: () => [{ name: 'dexscreener', supportsChains: ['solana'] }],
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
  };
  const kinds = { detect: async () => 'token' as const };
  const service = new AddressSnapshotService(
    catalog as never,
    providers as never,
    kinds as never,
    new SnapshotAggregatorService(),
    new SnapshotHistoryRepository(),
    [healthyFetcher('dexscreener')],
    null,
    null,
    devHoldings as never,
    null,
    null,
    launchpad as never,
    dexscreener as never,
    null,
    null,
    null,
    null,
  );
  return { service, started };
}

const INPUT = {
  chain: 'solana',
  value: 'So11111111111111111111111111111111111111112',
};

/**
 * Snapshot-tail parallelization (dexter plan todo 29): the
 * launchpad/venue/dev extras race under one shared budget (max 3 in
 * flight, 400ms each, degrade-to-null) — the card NEVER waits on an
 * extra. Caps, timeouts, and degrade behavior are pinned here.
 */
describe('AddressSnapshotService tail (parallel extras, todo 29)', () => {
  it('pins the tail budgets (concurrency 3, 400ms per extra)', () => {
    expect(SNAPSHOT_TAIL_CONCURRENCY).toBe(3);
    expect(SNAPSHOT_TAIL_EXTRA_TIMEOUT_MS).toBe(400);
  });

  it('runTailCapped respects the cap and preserves order', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const tasks = Array.from({ length: 6 }, (_, i) => async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await sleep(20);
      inFlight -= 1;
      return i;
    });
    const results = await runTailCapped(tasks, 3);
    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('runs all three extras in parallel (starts overlap)', async () => {
    const { service, started } = buildService({
      launchpadMs: 150,
      venueMs: 150,
      devMs: 150,
    });
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.launchpad).not.toBeNull();
    expect(snapshot.venue).not.toBeNull();
    expect(snapshot.devPctSupply).toBe(1.5);
    const firsts = [
      started['launchpad'][0],
      started['venue'][0],
      started['dev'][0],
    ];
    // Sequential extras would spread starts over ~300ms; parallel
    // starts land in the same tick (100ms is generous headroom).
    expect(Math.max(...firsts) - Math.min(...firsts)).toBeLessThan(100);
  });

  it('a slow extra degrades to null with a tail note — the card still renders', async () => {
    const { service } = buildService({
      launchpadMs: 1500,
      venueMs: 10,
      devMs: 10,
    });
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.launchpad).toBeNull();
    expect(snapshot.providerErrors['tail:launchpad']).toMatch(
      /tail budget 400ms/,
    );
    // Fast extras are unaffected by the slow sibling.
    expect(snapshot.venue).not.toBeNull();
    expect(snapshot.devPctSupply).toBe(1.5);
  });

  it('throwing extras degrade to null without blocking the card', async () => {
    const { service } = buildService({
      launchpadMs: 10,
      venueMs: 10,
      devMs: 10,
      launchpadThrows: true,
    });
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.launchpad).toBeNull();
    expect(snapshot.priceUsd).toBe(2.5);
  });
});
