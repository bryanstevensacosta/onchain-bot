import { AddressSnapshotService } from './address-snapshot.service';
import { SnapshotAggregatorService } from './snapshot-aggregator.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import type { QuoteFetcher } from '../domain/snapshot-quote.types';
import type { AddressSnapshot } from '../domain/snapshot.types';

function okFetcher(name: string, quote: Record<string, number | string>): QuoteFetcher {
  return {
    name,
    supportsChains: ['solana'],
    fetch: async () => quote,
  };
}

function failFetcher(name: string, message: string): QuoteFetcher {
  return {
    name,
    supportsChains: ['solana'],
    fetch: async () => {
      throw new Error(message);
    },
  };
}

interface CacheStub {
  get: jest.Mock;
  set: jest.Mock;
}

function buildService(fetchers: ReadonlyArray<QuoteFetcher>, cache: CacheStub | null) {
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
  );
  return { service, registry, history, cache };
}

const INPUT = { chain: 'solana', value: 'So11111111111111111111111111111111111111112' };

/**
 * Service-level aggregation contract (Tramo 3, todo-3 gap): one ok +
 * one fail merges to `ready`; all fail stays `pending` with explicit
 * `providerErrors`; a hot cache hit skips every provider call.
 */
describe('AddressSnapshotService (live aggregation)', () => {
  it('one ok + one fail -> ready with merged fields + named error', async () => {
    const cache: CacheStub = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    const { service, history } = buildService(
      [okFetcher('dexscreener', { priceUsd: 1.5, symbol: 'WIF' }), failFetcher('geckoterminal', 'boom')],
      cache,
    );
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.priceUsd).toBe(1.5);
    expect(snapshot.symbol).toBe('WIF');
    expect(snapshot.sources).toEqual(['dexscreener']);
    expect(snapshot.providerErrors['geckoterminal']).toContain('boom');
    expect(await history.count()).toBe(1);
    expect(cache.set).toHaveBeenCalledTimes(1);
  });

  it('all fail -> pending with every provider error recorded', async () => {
    const cache: CacheStub = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    const { service } = buildService(
      [failFetcher('dexscreener', 'down-a'), failFetcher('geckoterminal', 'down-b')],
      cache,
    );
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot.status).toBe('pending');
    expect(snapshot.priceUsd).toBeNull();
    expect(snapshot.providerErrors['dexscreener']).toContain('down-a');
    expect(snapshot.providerErrors['geckoterminal']).toContain('down-b');
    expect(snapshot.sources).toEqual([]);
  });

  it('cache hit skips every provider call and history write', async () => {
    const cached = { status: 'ready', priceUsd: 9, key: 'solana:abc' } as AddressSnapshot;
    const cache: CacheStub = {
      get: jest.fn(async () => cached),
      set: jest.fn(async () => undefined),
    };
    let calls = 0;
    const counting: QuoteFetcher = {
      name: 'dexscreener',
      supportsChains: ['solana'],
      fetch: async () => {
        calls += 1;
        return { priceUsd: 1 };
      },
    };
    const { service, history } = buildService([counting], cache);
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot).toBe(cached);
    expect(calls).toBe(0);
    expect(await history.count()).toBe(0);
    expect(cache.set).not.toHaveBeenCalled();
  });
});
