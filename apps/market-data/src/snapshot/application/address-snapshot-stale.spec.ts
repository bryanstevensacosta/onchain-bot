import { AddressSnapshotService } from './address-snapshot.service';
import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import {
  emptySnapshotQuote,
  type QuoteFetcher,
} from '../domain/snapshot-quote.types';

const ADDRESS = 'So11111111111111111111111111111111111111112';
const KEY = `solana:${ADDRESS.toLowerCase()}`;

function failFetcher(name: string): QuoteFetcher {
  return {
    name,
    supportsChains: ['solana'],
    fetch: async () => {
      throw new Error('down');
    },
  };
}

function readyFetcher(): QuoteFetcher {
  return {
    name: 'dexscreener',
    supportsChains: ['solana'],
    fetch: async () => ({ symbol: 'WIF', name: 'dogwifhat', priceUsd: 1.5 }),
  };
}

interface CacheStub {
  get: jest.Mock;
  set: jest.Mock;
}

function buildService(
  fetchers: ReadonlyArray<QuoteFetcher>,
  cache: CacheStub | null,
  history: SnapshotHistoryRepository,
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
  const service = new AddressSnapshotService(
    catalog as never,
    registry as never,
    kinds as never,
    new SnapshotAggregatorService(),
    history,
    fetchers,
    cache as never,
  );
  return { service, history };
}

async function seedReady(history: SnapshotHistoryRepository, key = KEY) {
  await history.save({
    key,
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
}

const INPUT = { chain: 'solana', value: ADDRESS };

/**
 * Serve-stale floor (dexter plan todo 19b1, NO background refresh):
 * when the fan-out fails, the newest ready history row replays WITH
 * the stale bit — never cached, never re-persisted, so the next
 * request retries providers naturally. Over-bound rows and
 * pendings-only histories answer honest pending.
 */
describe('AddressSnapshotService (serve-stale floor, no background refresh)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('replays the newest ready row with the stale bit when providers fail', async () => {
    const cache: CacheStub = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    const history = new SnapshotHistoryRepository();
    await seedReady(history);
    const { service } = buildService(
      [failFetcher('dexscreener'), failFetcher('geckoterminal')],
      cache,
      history,
    );
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.stale).toBe(true);
    expect(typeof snapshot.staleAsOf).toBe('string');
    expect(typeof snapshot.staleAgeMs).toBe('number');
    expect(snapshot.symbol).toBe('WIF');
    expect(snapshot.priceUsd).toBe(1.5);
    expect(snapshot.sources).toEqual(['dexscreener']);
  });

  it('neither caches nor re-persists a stale replay', async () => {
    const cache: CacheStub = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    const history = new SnapshotHistoryRepository();
    await seedReady(history);
    const { service } = buildService(
      [failFetcher('dexscreener'), failFetcher('geckoterminal')],
      cache,
      history,
    );
    await service.getSnapshot(INPUT);
    await service.getSnapshot(INPUT);
    expect(cache.set).not.toHaveBeenCalled();
    expect(await history.count()).toBe(1);
  });

  it('answers honest pending when the newest ready row is over the 24h bound', async () => {
    const cache: CacheStub = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    const history = new SnapshotHistoryRepository();
    await seedReady(history);
    const { service } = buildService(
      [failFetcher('dexscreener'), failFetcher('geckoterminal')],
      cache,
      history,
    );
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + 25 * 60 * 60 * 1000);
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot.status).toBe('pending');
    expect(snapshot.stale).toBe(false);
    expect(snapshot.staleAsOf).toBeNull();
    expect(snapshot.staleAgeMs).toBeNull();
  });

  it('answers honest pending when history holds only pendings', async () => {
    const cache: CacheStub = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    const history = new SnapshotHistoryRepository();
    await history.save({
      key: KEY,
      chain: 'solana',
      address: ADDRESS.toLowerCase(),
      kind: 'token',
      status: 'pending',
      quote: emptySnapshotQuote(),
      sources: [],
      providerErrors: { dexscreener: 'down' },
    });
    const { service } = buildService(
      [failFetcher('dexscreener'), failFetcher('geckoterminal')],
      cache,
      history,
    );
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot.status).toBe('pending');
    expect(snapshot.stale).toBe(false);
  });

  it('never replays a ready row stored under a different key', async () => {
    const cache: CacheStub = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    const history = new SnapshotHistoryRepository();
    await seedReady(history, 'solana:otheraddress');
    const { service } = buildService(
      [failFetcher('dexscreener'), failFetcher('geckoterminal')],
      cache,
      history,
    );
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot.status).toBe('pending');
    expect(snapshot.stale).toBe(false);
  });

  it('marks fresh snapshots stale:false with null as-of/age (and caches them)', async () => {
    const cache: CacheStub = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => undefined),
    };
    const history = new SnapshotHistoryRepository();
    const { service } = buildService([readyFetcher()], cache, history);
    const snapshot = await service.getSnapshot(INPUT);
    expect(snapshot.status).toBe('ready');
    expect(snapshot.stale).toBe(false);
    expect(snapshot.staleAsOf).toBeNull();
    expect(snapshot.staleAgeMs).toBeNull();
    expect(cache.set).toHaveBeenCalledTimes(1);
  });
});
