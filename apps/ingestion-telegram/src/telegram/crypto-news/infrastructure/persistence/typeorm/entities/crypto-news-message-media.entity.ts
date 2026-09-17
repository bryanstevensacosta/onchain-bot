import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CryptoNewsMessageEntity } from './crypto-news-message.entity';

/**
 * TypeORM persistence shape for the media attachments of an ingested
 * `CryptoNewsMessage`. One row per downloaded photo (typically 0..3 per
 * message). The on-disk file at `filePath` is the same path the API
 * endpoint will serve back to the dashboard in T7.
 *
 * Table: `crypto_news_message_media` — join table from
 * `crypto_news_messages.id` (UUID) with FK-level `ON DELETE CASCADE`
 * so deleting a message atomically removes its media rows in the DB.
 *
 * Why `onDelete` lives on `@ManyToOne` (not `@JoinColumn`): TypeORM
 * 0.3.30's `JoinColumnOptions` type rejects `onDelete`; only the
 * relation decorator accepts it. `@ManyToOne`'s `onDelete` is what
 * produces `FOREIGN KEY ... ON DELETE CASCADE` in the synchronize DDL —
 * TypeORM-level `cascade: true` only handles INSERT/UPDATE propagation,
 * not FK-level DELETEs (the gap Momus flagged in G-7).
 *
 * NOTE: this is NOT a domain object. The domain `CryptoNewsMedia` lives
 * at `telegram/ingestion/crypto-news/domain/value-objects/crypto-news-media.vo.ts`.
 */
@Entity({ name: 'crypto_news_message_media' })
@Index('idx_crypto_news_message_media_message_id', ['messageId'])
export class CryptoNewsMessageMediaEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  public id!: string;

  /**
   * Parent message. `onDelete: 'CASCADE'` lives on the relation decorator
   * (NOT `@JoinColumn`) — TypeORM 0.3.30's `JoinColumnOptions` type does
   * not include `onDelete`; it must sit on `@ManyToOne`. With
   * `nullable: false` this yields `FOREIGN KEY ... REFERENCES ... ON
   * DELETE CASCADE` in the DDL.
   */
  @ManyToOne(() => CryptoNewsMessageEntity, (m) => m.media, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({
    name: 'message_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_crypto_news_message_media_message',
  })
  public message!: CryptoNewsMessageEntity;

  /** Exposed as a property for query convenience (typed against the parent UUID PK). */
  @Column({ name: 'message_id', type: 'uuid' })
  public messageId!: string;

  /** Zero-based position within the parent message's photo album. */
  @Column({ name: 'media_index', type: 'smallint' })
  public index!: number;

  /** Discriminator. `'photo'`, `'video'`, or `'webpage'` (link preview). */
  @Column({ name: 'type', type: 'varchar', length: 16, default: 'photo' })
  public type!: 'photo' | 'video' | 'webpage';

  /** Absolute or workspace-relative path on disk; served by the API in T7. */
  @Column({ name: 'file_path', type: 'text' })
  public filePath!: string;

  /** MIME detected from magic bytes at download time (nullable on detection failure). */
  @Column({ name: 'mime_type', type: 'varchar', length: 64, nullable: true })
  public mimeType!: string | null;

  /** Byte size of the downloaded file (nullable when download failed before completion). */
  @Column({ name: 'file_size', type: 'integer', nullable: true })
  public fileSize!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
