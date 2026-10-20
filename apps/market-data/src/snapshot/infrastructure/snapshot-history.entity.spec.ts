import { getMetadataArgsStorage } from 'typeorm';
import {
  SnapshotHistoryEntity,
  normalizeHistorySources,
  toHistoryRow,
} from './snapshot-history.entity';

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

/**
 * Staging drift regression (2026-10-20, todo-8 soak).
 *
 * The live column was plain `text` while the entity maps `text[]`;
 * the driver returned literals like `'{"onchain-direct"}'` and the
 * old spread emitted one entry per character on every stale replay.
 * `normalizeHistorySources` is the runtime guard; the migration
 * (`FixSnapshotHistorySourcesArray1775000000000`) fixes the column.
 */
describe('normalizeHistorySources (legacy text-column guard)', () => {
  it('passes a real text[] array through unchanged', () => {
    expect(
      normalizeHistorySources(['dexscreener', 'geckoterminal', 'evm-rpc']),
    ).toEqual(['dexscreener', 'geckoterminal', 'evm-rpc']);
  });

  it('parses the exact literal the pre-fix staging column returned', () => {
    expect(normalizeHistorySources('{"onchain-direct"}')).toEqual([
      'onchain-direct',
    ]);
    expect(
      normalizeHistorySources('{"dexscreener","geckoterminal","evm-rpc"}'),
    ).toEqual(['dexscreener', 'geckoterminal', 'evm-rpc']);
    expect(normalizeHistorySources('{a,b}')).toEqual(['a', 'b']);
  });

  it('never spreads a literal into single characters', () => {
    const sources = normalizeHistorySources('{"onchain-direct"}');
    expect(sources).toEqual(['onchain-direct']);
    expect(sources).not.toHaveLength('{"onchain-direct"}'.length);
  });

  it('resolves empty/unknown shapes to an honest empty array', () => {
    expect(normalizeHistorySources('{}')).toEqual([]);
    expect(normalizeHistorySources('')).toEqual([]);
    expect(normalizeHistorySources('not-an-array')).toEqual([]);
    expect(normalizeHistorySources(null)).toEqual([]);
    expect(normalizeHistorySources(undefined)).toEqual([]);
    expect(normalizeHistorySources(42)).toEqual([]);
  });

  it('drops non-string entries inside an array', () => {
    expect(
      normalizeHistorySources(['kept', 7, null, { x: 1 }, 'also-kept']),
    ).toEqual(['kept', 'also-kept']);
  });

  it('normalizes at the row boundary (toHistoryRow)', () => {
    const entity = {
      key: 'bsc:0xabc',
      chain: 'bsc',
      address: '0xabc',
      kind: 'token',
      status: 'ready',
      quote: {},
      sources: '{"dexscreener"}' as unknown as string[],
      providerErrors: {},
      createdAt: new Date('2026-10-20T00:00:00.000Z'),
    } as SnapshotHistoryEntity;
    expect(toHistoryRow(entity).sources).toEqual(['dexscreener']);
  });
});
