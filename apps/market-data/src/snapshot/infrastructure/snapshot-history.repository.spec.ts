import { AddressKind } from 'address/domain/address-kind';
import { emptySnapshotQuote } from '../domain/snapshot-quote.types';
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
