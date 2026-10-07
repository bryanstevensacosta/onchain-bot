import { AddressKind } from 'address/domain/address-kind';
import {
  emptySnapshotQuote,
  resolveStaleMaxAgeMs,
  SNAPSHOT_STALE_MAX_AGE_MS,
} from '../domain/snapshot-quote.types';
import { SnapshotHistoryRepository } from './snapshot-history.repository';
import type { SnapshotHistoryRow } from './snapshot-history.repository';

function row(key: string): Omit<SnapshotHistoryRow, 'createdAt'> {
  return {
    key,
    chain: 'solana',
    address: 'So11111111111111111111111111111111111111112',
    kind: 'token',
    status: 'ready',
    quote: emptySnapshotQuote(),
    sources: ['dexscreener'],
    providerErrors: {},
  };
}

/**
 * Failing-first spec (Tramo 3, todo 14, GAP-1).
 *
 * DB-backed history with an in-memory fallback: without a TypeORM
 * store the repository keeps the v1 ring semantics (save/list/count);
 * with one it delegates + maps. `deleteOlderThan` is the janitor
 * primitive on both paths. No live DB needed (the store is faked).
 */
describe('SnapshotHistoryRepository (persistent ring + janitor primitive)', () => {
  it('keeps ring semantics without a store (fallback)', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(row('solana:abc'));
    await history.save(row('solana:def'));
    expect(await history.count()).toBe(2);
    const recent = await history.listRecent(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].key).toBe('solana:def');
    expect(typeof recent[0].createdAt).toBe('string');
  });

  it('prunes rows older than the cutoff without a store (fallback janitor)', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(row('solana:old'));
    await history.save(row('solana:fresh'));
    const deleted = await history.deleteOlderThan(
      new Date(Date.now() + 60_000),
    );
    expect(deleted).toBe(2);
    expect(await history.count()).toBe(0);
    await history.save(row('solana:fresh'));
    const kept = await history.deleteOlderThan(new Date(0));
    expect(kept).toBe(0);
    expect(await history.count()).toBe(1);
  });

  it('resolves the default stale bound to 24h and honors overrides', async () => {
    expect(resolveStaleMaxAgeMs(undefined)).toBe(24 * 60 * 60 * 1000);
    expect(resolveStaleMaxAgeMs('')).toBe(24 * 60 * 60 * 1000);
    expect(resolveStaleMaxAgeMs('not-a-number')).toBe(24 * 60 * 60 * 1000);
    expect(resolveStaleMaxAgeMs('0')).toBe(24 * 60 * 60 * 1000);
    expect(resolveStaleMaxAgeMs('-3')).toBe(24 * 60 * 60 * 1000);
    expect(resolveStaleMaxAgeMs('1')).toBe(60 * 60 * 1000);
    expect(resolveStaleMaxAgeMs('48')).toBe(48 * 60 * 60 * 1000);
  });

  it('delegates to the TypeORM store when one is injected', async () => {
    const saved: Array<Record<string, unknown>> = [];
    const store = {
      create: (input: Record<string, unknown>) => ({ ...input }),
      save: async (entity: Record<string, unknown>) => {
        saved.push(entity);
        return entity;
      },
      find: async () => saved,
      count: async () => saved.length,
      createQueryBuilder: () => ({
        delete: () => ({
          where: () => ({
            execute: async () => ({ affected: saved.length }),
          }),
        }),
      }),
    };
    const history = new SnapshotHistoryRepository(store as unknown as never);
    const created = await history.save(row('solana:abc'));
    expect(created.key).toBe('solana:abc');
    expect(typeof created.createdAt).toBe('string');
    expect(await history.count()).toBe(1);
    const recent = await history.listRecent(10);
    expect(recent[0].key).toBe('solana:abc');
  });
});

const HOUR_MS = 60 * 60 * 1000;

function readyRow(
  key: string,
  overrides: Partial<Omit<SnapshotHistoryRow, 'createdAt'>> = {},
): Omit<SnapshotHistoryRow, 'createdAt'> {
  return {
    key,
    chain: 'solana',
    address: 'So11111111111111111111111111111111111111112',
    kind: 'token',
    status: 'ready',
    quote: { ...emptySnapshotQuote(), symbol: 'WIF', name: 'dogwifhat' },
    sources: ['dexscreener'],
    providerErrors: {},
    ...overrides,
  };
}

/**
 * Serve-stale lookup (dexter plan todo 19b1): exact-key newest-ready
 * within the bound. Pendings never replay, over-bound rows answer
 * null, and the DB path constrains the query to the indexed
 * `(key, createdAt)` shape (equality + DESC + LIMIT 1) instead of a
 * full scan.
 */
describe('SnapshotHistoryRepository.findLatestReady (serve-stale floor)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-07T00:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('serves the newest ready row for the exact key', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(readyRow('solana:aaa'));
    jest.setSystemTime(new Date('2026-10-07T01:00:00.000Z'));
    await history.save(readyRow('solana:aaa'));
    const latest = await history.findLatestReady(
      'solana:aaa',
      'token',
      SNAPSHOT_STALE_MAX_AGE_MS,
    );
    expect(latest?.createdAt).toBe('2026-10-07T01:00:00.000Z');
    expect(latest?.status).toBe('ready');
  });

  it('answers null when history holds only pendings for the key', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(
      readyRow('solana:aaa', {
        status: 'pending',
        quote: emptySnapshotQuote(),
        sources: [],
      }),
    );
    jest.setSystemTime(new Date('2026-10-07T01:00:00.000Z'));
    await history.save(
      readyRow('solana:aaa', {
        status: 'pending',
        quote: emptySnapshotQuote(),
        sources: [],
      }),
    );
    await expect(
      history.findLatestReady('solana:aaa', 'token', SNAPSHOT_STALE_MAX_AGE_MS),
    ).resolves.toBeNull();
  });

  it('answers null when the newest ready row is over the bound', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(readyRow('solana:aaa'));
    jest.setSystemTime(new Date('2026-10-08T01:00:01.000Z'));
    await expect(
      history.findLatestReady('solana:aaa', 'token', SNAPSHOT_STALE_MAX_AGE_MS),
    ).resolves.toBeNull();
  });

  it('honors a custom bound (1h): 2h-old ready is over-bound', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(readyRow('solana:aaa'));
    jest.setSystemTime(new Date('2026-10-07T02:00:01.000Z'));
    await expect(
      history.findLatestReady('solana:aaa', 'token', HOUR_MS),
    ).resolves.toBeNull();
  });

  it('never leaks across keys or kinds', async () => {
    const history = new SnapshotHistoryRepository();
    await history.save(readyRow('solana:other'));
    await history.save(readyRow('solana:aaa', { kind: 'wallet' }));
    await expect(
      history.findLatestReady('solana:aaa', 'token', SNAPSHOT_STALE_MAX_AGE_MS),
    ).resolves.toBeNull();
  });

  it('queries the store by exact key (indexed shape, no full scan)', async () => {
    const seen: Array<Record<string, unknown>> = [];
    const entity = {
      key: 'solana:aaa',
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111112',
      kind: 'token',
      status: 'ready',
      quote: { ...emptySnapshotQuote(), symbol: 'WIF' },
      sources: ['dexscreener'],
      providerErrors: {},
      createdAt: new Date('2026-10-07T00:00:00.000Z'),
    };
    const store = {
      create: (input: Record<string, unknown>) => ({ ...input }),
      save: async (input: Record<string, unknown>) => input,
      find: async (args: Record<string, unknown>) => {
        seen.push(args);
        return [entity];
      },
      count: async () => 1,
      createQueryBuilder: () => ({
        delete: () => ({ where: () => ({ execute: async () => ({}) }) }),
      }),
    };
    const history = new SnapshotHistoryRepository(store as unknown as never);
    const latest = await history.findLatestReady(
      'solana:aaa',
      'token',
      SNAPSHOT_STALE_MAX_AGE_MS,
    );
    expect(latest?.key).toBe('solana:aaa');
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      where: { key: 'solana:aaa', kind: 'token', status: 'ready' },
      order: { createdAt: 'DESC' },
      take: 1,
    });
  });

  it('answers null on the store path when the newest ready is over-bound', async () => {
    const entity = {
      key: 'solana:aaa',
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111112',
      kind: 'token',
      status: 'ready',
      quote: { ...emptySnapshotQuote(), symbol: 'WIF' },
      sources: ['dexscreener'],
      providerErrors: {},
      createdAt: new Date('2026-10-06T00:00:00.000Z'),
    };
    const store = {
      create: (input: Record<string, unknown>) => ({ ...input }),
      save: async (input: Record<string, unknown>) => input,
      find: async () => [entity],
      count: async () => 1,
      createQueryBuilder: () => ({
        delete: () => ({ where: () => ({ execute: async () => ({}) }) }),
      }),
    };
    const history = new SnapshotHistoryRepository(store as unknown as never);
    jest.setSystemTime(new Date('2026-10-08T00:00:01.000Z'));
    await expect(
      history.findLatestReady('solana:aaa', 'token', SNAPSHOT_STALE_MAX_AGE_MS),
    ).resolves.toBeNull();
  });
});
