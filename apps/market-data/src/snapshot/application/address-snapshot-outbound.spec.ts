import { AddressSnapshotService } from './address-snapshot.service';
import { SnapshotAggregatorService } from 'aggregators/application/snapshot-aggregator.service';
import { SnapshotHistoryRepository } from '../infrastructure/snapshot-history.repository';
import {
  SNAPSHOT_CACHE_TTL_SECONDS,
  type QuoteFetcher,
} from '../domain/snapshot-quote.types';
import type { AddressSnapshot } from '../domain/snapshot.types';

function okFetcher(name: string): QuoteFetcher {
  return {
    name,
    supportsChains: ['solana'],
    fetch: async () => ({ priceUsd: 2.5, symbol: 'WIF' }),
  };
}

function harness(options: {
  cached: AddressSnapshot | null;
  allowOutbound: boolean;
}) {
  const calls: Array<{ key: string; limit: number; windowMs: number }> = [];
  const cache = {
    get: async <T>(): Promise<T | null> =>
      (options.cached as unknown as T | null) ?? null,
    set: jest.fn(async () => undefined),
  };
  const limiter = {
    tryAcquire: (key: string, limit: number, windowMs: number) => {
      calls.push({ key, limit, windowMs });
      return options.allowOutbound;
    },
    resetKey: () => undefined,
    resetAll: () => undefined,
  };
  const catalog = { findById: async () => ({ id: 'solana' }) };
  const providers = {
    listProviders: () => [
      {
        name: 'dexscreener',
        kind: 'market',
        supportsChains: ['solana'],
        rateLimitPerMin: 60,
      },
    ],
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
  };
  const kinds = { detect: async () => 'token' };
  const service = new AddressSnapshotService(
    catalog as never,
    providers as never,
    kinds as never,
    new SnapshotAggregatorService(),
    new SnapshotHistoryRepository(),
    [okFetcher('dexscreener')],
    cache as never,
    limiter as never,
  );
  return { service, calls, cache };
}

/**
 * Failing-first spec (Tramo 3, todo 14, anti-ban order).
 *
 * MANDATORY order: cache first (a HIT consumes no outbound quota),
 * the limiter gates providers ONLY on a miss. A denied bucket is an
 * explicit `providerErrors` entry — the snapshot still resolves
 * (fail-open), and the 30s cache TTL is kept.
 */
describe('AddressSnapshotService (cache-first, limiter-only-on-miss)', () => {
  it('keeps the 30s hot-result TTL', () => {
    expect(SNAPSHOT_CACHE_TTL_SECONDS).toBe(30);
  });

  it('a cache HIT consumes no outbound quota', async () => {
    const cached = { key: 'solana:abc', status: 'ready' };
    const { service, calls } = harness({
      cached: cached as unknown as AddressSnapshot,
      allowOutbound: true,
    });
    const snapshot = await service.getSnapshot({
      chain: 'solana',
      value: 'abc',
    });
    expect(snapshot.key).toBe('solana:abc');
    expect(calls).toEqual([]);
  });

  it('a miss gates the fetcher through the outbound bucket + warms the cache', async () => {
    const { service, calls, cache } = harness({
      cached: null,
      allowOutbound: true,
    });
    const snapshot = await service.getSnapshot({
      chain: 'solana',
      value: 'So11111111111111111111111111111111111111112',
      kindHint: 'token',
    });
    expect(snapshot.status).toBe('ready');
    expect(calls).toEqual([
      { key: 'outbound:dexscreener', limit: 60, windowMs: 60_000 },
    ]);
    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(cache.set.mock.calls[0][2]).toBe(30);
  });

  it('a denied bucket is an explicit provider error, never a crash', async () => {
    const { service } = harness({ cached: null, allowOutbound: false });
    const snapshot = await service.getSnapshot({
      chain: 'solana',
      value: 'So11111111111111111111111111111111111111112',
      kindHint: 'token',
    });
    expect(snapshot.status).toBe('pending');
    expect(snapshot.providerErrors['dexscreener']).toMatch(/outbound/);
  });
});
