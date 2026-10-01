import { Entity, PrimaryColumn, Column, Index, Unique } from 'typeorm';

/**
 * TypeORM persistence shape for `DedupRecord` (table `dedup_fingerprints`).
 * NOT wired into a module yet (GAP-1); live reads use the in-memory
 * store. Storage decision: plain relational table, NO pgvector (vetoable
 * in review — embeddings are compared in-process over the 48h window).
 */
@Entity('dedup_fingerprints')
@Unique('uq_dedup_fingerprint_source', [
  'fingerprintType',
  'fingerprintValue',
  'source',
])
@Index('idx_dedup_source_created', ['source', 'createdAt'])
@Index('idx_dedup_source_type', ['source', 'fingerprintType'])
export class DedupRecordOrmEntity {
  @PrimaryColumn({ type: 'varchar', length: 255 })
  public id!: string;

  @Column({ type: 'varchar', length: 16 })
  public fingerprintType!: string;

  @Column({ type: 'varchar', length: 512 })
  public fingerprintValue!: string;

  @Column({ type: 'varchar', length: 64 })
  public source!: string;

  @Column({ type: 'varchar', length: 64 })
  public channelId!: string;

  @Column({ type: 'int' })
  public messageId!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  public contentHash!: string | null;

  @Column({ type: 'simple-array', nullable: true })
  public urlHashes!: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  public tokens!: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  public numbers!: number[] | null;

  @Column({ type: 'simple-array', nullable: true })
  public entities!: string[] | null;

  @Column({ type: 'simple-array', nullable: true })
  public cashtags!: string[] | null;

  @Column({ type: 'text', nullable: true })
  public content!: string | null;

  @Column({ type: 'simple-array', nullable: true })
  public embedding!: number[] | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  public referencedEntryId!: string | null;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt!: Date;
}
