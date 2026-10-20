import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import type { SnapshotQuote } from '../domain/snapshot-quote.types';
import type { SnapshotHistoryRow } from './snapshot-history.repository';

/**
 * 90-day retention window for persistent snapshot history
 * (Tramo 3, todo 14, GAP-1). The janitor prunes everything older.
 */
export const SNAPSHOT_HISTORY_RETENTION_DAYS = 90;

/**
 * Persistent snapshot history (Tramo 3, todo 14, GAP-1).
 *
 * Replaces the in-memory ring: every `AddressSnapshotService`
 * call persists one row (append-only, incl. the todo-46 one-time
 * per-pool OHLC seed — seeded rows carry candle-time `createdAt`,
 * so the table does NOT start empty-only on first deploy anymore:
 * the first encounter with a Gecko OHLC pool backfills its 24h
 * window once). `unique(key, createdAt)` is the dedup contract
 * (the seed's idempotency falls out of it — no guard table); the
 * BTREE `(key, createdAt)` serves per-address window reads.
 */
@Entity('snapshot_history')
@Unique('uq_snapshot_history_key_created', ['key', 'createdAt'])
@Index('ix_snapshot_history_key_created', ['key', 'createdAt'])
export class SnapshotHistoryEntity {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({ type: 'text' })
  public key!: string;

  @Column({ type: 'text' })
  public chain!: string;

  @Column({ type: 'text' })
  public address!: string;

  @Column({ type: 'text' })
  public kind!: string;

  @Column({ type: 'text' })
  public status!: string;

  @Column({ type: 'jsonb' })
  public quote!: SnapshotQuote;

  @Column({ type: 'text', array: true, default: '{}' })
  public sources!: string[];

  @Column({ type: 'jsonb' })
  public providerErrors!: Record<string, string>;

  @CreateDateColumn({ type: 'timestamptz' })
  public createdAt!: Date;
}

/**
 * Defensive `sources` normalization (staging drift fix, 2026-10-20).
 *
 * The live staging column was created as plain `text` by
 * `CreateSnapshotHistory1772000000000` while this entity maps
 * `text[]`; the driver then returned Postgres array literals
 * (`'{"onchain-direct"}'`) as strings and the old `[...sources]`
 * spread emitted one entry PER CHARACTER on every stale replay.
 * The column is fixed by `FixSnapshotHistorySourcesArray1775000000000`;
 * this guard keeps a legacy/unmigrated schema from silently
 * corrupting the served `sources` array again (honest `[]` on any
 * value that is neither an array nor a parseable literal).
 */
export function normalizeHistorySources(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  return typeof value === 'string' ? parsePostgresTextArrayLiteral(value) : [];
}

/**
 * Parses one Postgres text-array literal (`{a,b}`, `{"a","b"}`,
 * quoted/escaped entries) — only the shapes this column can hold.
 * Unparseable input (no surrounding braces) resolves `[]`.
 */
function parsePostgresTextArrayLiteral(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return [];
  }
  const inner = trimmed.slice(1, -1);
  if (inner === '') {
    return [];
  }
  const entries: string[] = [];
  let current = '';
  let inQuotes = false;
  let escaped = false;
  for (const char of inner) {
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      entries.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  entries.push(current);
  return entries;
}

export function toHistoryRow(
  entity: SnapshotHistoryEntity,
): SnapshotHistoryRow {
  return {
    key: entity.key,
    chain: entity.chain,
    address: entity.address,
    kind: entity.kind as SnapshotHistoryRow['kind'],
    status: entity.status as SnapshotHistoryRow['status'],
    quote: entity.quote,
    sources: normalizeHistorySources(entity.sources),
    providerErrors: { ...(entity.providerErrors ?? {}) },
    createdAt:
      entity.createdAt instanceof Date
        ? entity.createdAt.toISOString()
        : String(entity.createdAt),
  };
}
