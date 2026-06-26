import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type KolKnownListKind = 'GOOD' | 'BAD';

/**
 * TypeORM persistence shape for `kol_known_lists`.
 *
 * One row per (kol_id, kind) tuple — a KOL can be GOOD or BAD, not
 * both (UNIQUE constraint). BAD wins via the port's resolution
 * order (KNOWN_BAD checked first).
 *
 * The table is editable at runtime via the planned admin API
 * (POST /kol/whitelist, DELETE /kol/whitelist/:kolId, etc.) so
 * operator adjustments no longer require a deploy.
 */
@Entity({ name: 'kol_known_lists' })
@Index('idx_kol_known_lists_kol_id', ['kolId'])
@Index('idx_kol_known_lists_kind', ['kind'])
export class KolKnownListEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  public id!: string;

  @Column({ name: 'kol_id', type: 'varchar', length: 64 })
  public kolId!: string;

  @Column({ name: 'kind', type: 'varchar', length: 8 })
  public kind!: KolKnownListKind;

  @Column({ name: 'reason', type: 'text', nullable: true })
  public reason!: string | null;

  @Column({ name: 'evidence_url', type: 'text', nullable: true })
  public evidenceUrl!: string | null;

  @Column({ name: 'added_by', type: 'varchar', length: 100, nullable: true })
  public addedBy!: string | null;

  @CreateDateColumn({ name: 'added_at', type: 'timestamptz' })
  public addedAt!: Date;
}