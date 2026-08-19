import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * TypeORM persistence shape for `DedupRecord`.
 *
 * Table: `dedup_fingerprints` — stores deduplication fingerprints
 * for crypto news messages. Composite uniqueness on
 * (fingerprint_type, fingerprint_value, source) to prevent duplicate
 * entries.
 *
 * NOTE: this is NOT the domain entity. The domain entity lives at
 * `shared/deduplication/domain/entities/dedup-record.entity.ts`.
 */
@Entity({ name: 'dedup_fingerprints' })
@Index('idx_dedup_fingerprints_source_created', ['source', 'createdAt'])
@Index('idx_dedup_fingerprints_source_type', ['source', 'fingerprintType'])
@Index(
  'uq_dedup_fingerprints_type_value_source',
  ['fingerprintType', 'fingerprintValue', 'source'],
  { unique: true },
)
export class DedupRecordEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  id!: string;

  @Column({ name: 'fingerprint_type', type: 'varchar', length: 16 })
  fingerprintType!: string; // 'exact' | 'content' | 'url' | 'semantic'

  @Column({ name: 'fingerprint_value', type: 'varchar', length: 512 })
  fingerprintValue!: string;

  @Column({ name: 'source', type: 'varchar', length: 64 })
  source!: string;

  @Column({ name: 'channel_id', type: 'varchar', length: 64 })
  channelId!: string;

  @Column({ name: 'message_id', type: 'integer' })
  messageId!: number;

  @Column({ name: 'urls_hashes', type: 'simple-array', nullable: true })
  urlsHashes!: string[] | null;

  @Column({ name: 'tokens', type: 'simple-array', nullable: true })
  tokens!: string[] | null;

  @Column({ name: 'numbers', type: 'simple-array', nullable: true })
  numbers!: number[] | null;

  @Column({ name: 'entities', type: 'simple-array', nullable: true })
  entities!: string[] | null;

  @Column({ name: 'cashtags', type: 'simple-array', nullable: true })
  cashtags!: string[] | null;

  @Column({ name: 'content', type: 'text', nullable: true })
  content!: string | null;

  @Column({ name: 'embedding', type: 'simple-array', nullable: true })
  embedding!: number[] | null;

  @Column({
    name: 'referenced_entry_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  referencedEntryId!: string | null;

  @Column({
    name: 'referenced_channel_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  referencedChannelId!: string | null;

  @Column({ name: 'referenced_message_id', type: 'integer', nullable: true })
  referencedMessageId!: number | null;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
