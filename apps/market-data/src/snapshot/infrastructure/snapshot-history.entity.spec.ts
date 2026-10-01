import { getMetadataArgsStorage } from 'typeorm';
import { SnapshotHistoryEntity } from './snapshot-history.entity';

/**
 * Failing-first spec (Tramo 3, todo 14, GAP-1).
 *
 * The persistent history contract: TypeORM entity `snapshot_history`
 * (uuid PK + unique(key, createdAt); BTREE (key, createdAt)) whose
 * columns mirror `SnapshotHistoryRow`. Metadata-only — no DB needed.
 */
describe('SnapshotHistoryEntity (persistent history contract)', () => {
  it('maps to table snapshot_history with a uuid PK', () => {
    const tables = getMetadataArgsStorage().tables.filter(
      (table) => table.target === SnapshotHistoryEntity,
    );
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('snapshot_history');
  });

  it('carries every SnapshotHistoryRow column', () => {
    const columns = getMetadataArgsStorage()
      .columns.filter((column) => column.target === SnapshotHistoryEntity)
      .map((column) => column.propertyName);
    for (const expected of [
      'id',
      'key',
      'chain',
      'address',
      'kind',
      'status',
      'quote',
      'sources',
      'providerErrors',
      'createdAt',
    ]) {
      expect(columns).toContain(expected);
    }
  });

  it('enforces unique(key, createdAt) plus a BTREE (key, createdAt) index', () => {
    const uniques = getMetadataArgsStorage().uniques.filter(
      (unique) => unique.target === SnapshotHistoryEntity,
    );
    expect(
      uniques.some((unique) =>
        Array.isArray(unique.columns)
          ? unique.columns.join(',') === 'key,createdAt'
          : false,
      ),
    ).toBe(true);
    const indices = getMetadataArgsStorage().indices.filter(
      (index) => index.target === SnapshotHistoryEntity,
    );
    const keyed = indices.filter((index) =>
      Array.isArray(index.columns)
        ? index.columns.join(',') === 'key,createdAt'
        : false,
    );
    expect(keyed.length).toBeGreaterThanOrEqual(1);
  });
});
