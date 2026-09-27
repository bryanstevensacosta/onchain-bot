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
 * call persists one row (append-only). No backfill — the table
 * starts empty on first deploy (documented, migration-only).
 * `unique(key, createdAt)` is the dedup contract; the BTREE
 * `(key, createdAt)` serves per-address window reads.
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

export function toHistoryRow(entity: SnapshotHistoryEntity): SnapshotHistoryRow {
  return {
    key: entity.key,
    chain: entity.chain,
    address: entity.address,
    kind: entity.kind as SnapshotHistoryRow['kind'],
    status: entity.status as SnapshotHistoryRow['status'],
    quote: entity.quote,
    sources: [...(entity.sources ?? [])],
    providerErrors: { ...(entity.providerErrors ?? {}) },
    createdAt:
      entity.createdAt instanceof Date
        ? entity.createdAt.toISOString()
        : String(entity.createdAt),
  };
}
