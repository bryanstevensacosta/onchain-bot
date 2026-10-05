import { AddressSnapshotService } from './address-snapshot.service';
import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import type { QuoteFetcher } from '../domain/snapshot-quote.types';

function failFetcher(name: string, message: string): QuoteFetcher {
  return {
    name,
    supportsChains: ['solana'],
    fetch: async () => {
      throw new Error(message);
    },
  };
}

function emptyFetcher(name: string): QuoteFetcher {
  return {
    name,
    supportsChains: ['solana'],
    fetch: async () => null,
  };
}

interface CacheStub {
  get: jest.Mock;
  set: jest.Mock;
}

function buildService(
  fetchers: ReadonlyArray<QuoteFetcher>,
  cache: CacheStub | null,
  metrics: { record: jest.Mock } | null = null,
) {
  const catalog = {
    findById: async (id: string) => (id === 'solana' ? { id } : null),
  };
  const registry = {
    listProviders: () => [
      { name: 'dexscreener', supportsChains: ['solana'] },
      { name: 'geckoterminal', supportsChains: ['solana'] },
    ],
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
  };
  const kinds = {
    detect: async () => 'token' as const,
  };
  const history = new SnapshotHistoryRepository();
  const service = new AddressSnapshotService(
    catalog as never,
    registry as never,
    kinds as never,
    new SnapshotAggregatorService(),
    history,
    fetchers,
    cache as never,
    null,
    null,
    null,
    null,
    null,
    null,
    metrics as never,
  );
  return { service, metrics };
}

const INPUT = {
  chain: 'solana',
  value: 'So11111111111111111111111111111111111111112',
};

/**
 * Service no-negative-cache (plan todo 19a, writer 1 of 3): pending
 * snapshots are NEVER written to the service cache, so the P12 repeat
 * re-touches providers instead of serving a HIT. History still
 * persists pending rows (19b SWR reads them); the nullReason counter
 * records the miss flavor.
 */
describe('AddressSnapshotService (pending snapshots bypass the service cache)', () => {
  it('never writes a pending shell and re-runs providers on repeat (P12-repeat)', async () => {
    const cache: CacheStub = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    let calls = 0;
    const counting = failFetcher('dexscreener', 'down');
    const countingGecko: QuoteFetcher = {
      name: 'geckoterminal',
      supportsChains: ['solana'],
      fetch: async () => {
        calls += 1;
        throw new Error('down');
      },
    };
    const metrics = { record: jest.fn() };
    const { service } = buildService([counting, countingGecko], cache, metrics);
    const first = await service.getSnapshot(INPUT);
    expect(first.status).toBe('pending');
    const second = await service.getSnapshot(INPUT);
    expect(second.status).toBe('pending');
    expect(cache.set).not.toHaveBeenCalled();
    expect(calls).toBe(2);
    expect(metrics.record).toHaveBeenCalledWith('transient');
  });

  it('records no-market when every provider honestly found nothing', async () => {
    const cache: CacheStub = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    const metrics = { record: jest.fn() };
    const { service } = buildService(
      [emptyFetcher('dexscreener'), emptyFetcher('geckoterminal')],
      cache,
      metrics,
    );
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot.status).toBe('pending');
    expect(cache.set).not.toHaveBeenCalled();
    expect(metrics.record).toHaveBeenCalledWith('no-market');
  });

  it('records cached when a pre-deploy pending row is served from cache', async () => {
    const cached = { status: 'pending', key: 'solana:abc' };
    const cache: CacheStub = {
      get: jest.fn(async () => cached),
      set: jest.fn(async () => undefined),
    };
    const metrics = { record: jest.fn() };
    const { service } = buildService(
      [emptyFetcher('dexscreener')],
      cache,
      metrics,
    );
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot).toBe(cached);
    expect(metrics.record).toHaveBeenCalledWith('cached');
    expect(cache.set).not.toHaveBeenCalled();
  });
});
