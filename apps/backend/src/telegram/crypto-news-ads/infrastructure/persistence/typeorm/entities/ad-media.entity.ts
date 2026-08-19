import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AdEntity } from 'telegram/crypto-news-ads/infrastructure/persistence/typeorm/entities/ad.entity';

/**
 * TypeORM persistence shape for the media attachment of an `Ad`. One row
 * per ad image (the `UNIQUE (ad_id)` constraint enforces the 1-image-per-ad
 * invariant at the DB level).
 *
 * Table: `crypto_news_ad_media` — join table from `crypto_news_ads.id`
 * (UUID) with FK-level `ON DELETE CASCADE` so deleting an ad atomically
 * removes its media rows in the DB.
 *
 * Why `onDelete` lives on `@ManyToOne` (not `@JoinColumn`): TypeORM
 * 0.3.30's `JoinColumnOptions` type rejects `onDelete`; only the relation
 * decorator accepts it. `@ManyToOne`'s `onDelete` is what produces
 * `FOREIGN KEY ... ON DELETE CASCADE` in the synchronize DDL.
 *
 * `@JoinColumn` IS required so the FK column is named `ad_id` (snake_case,
 * matching the migration) — a bare `@ManyToOne` would generate a camelCase
 * `adId` column and clash with the migration's `ad_id`.
 *
 * NOTE: this is NOT a domain object. The domain `Ad` lives at
 * `telegram/crypto-news-ads/domain/entities/ad.entity.ts`.
 */
@Entity({ name: 'crypto_news_ad_media' })
export class AdMediaEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  public id!: string;

  /**
   * Parent ad. `onDelete: 'CASCADE'` lives on the relation decorator
   * (NOT `@JoinColumn`) — TypeORM 0.3.30's `JoinColumnOptions` type does
   * not include `onDelete`. With `nullable: false` this yields `FOREIGN
   * KEY ... REFERENCES ... ON DELETE CASCADE` in the DDL.
   */
  @ManyToOne(() => AdEntity, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({
    name: 'ad_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_crypto_news_ad_media_ad',
  })
  public ad!: AdEntity;

  /** Exposed as a property for query convenience (typed against the parent UUID PK). */
  @Column({ name: 'ad_id', type: 'uuid' })
  public adId!: string;

  /** Path on disk, relative to `UPLOADS_ROOT`; served by the API. */
  @Column({ name: 'file_path', type: 'text' })
  public filePath!: string;

  /** MIME detected from magic bytes at upload time (nullable on detection failure). */
  @Column({ name: 'mime_type', type: 'varchar', length: 64, nullable: true })
  public mimeType!: string | null;

  /** Byte size of the stored file (nullable for legacy backfilled rows). */
  @Column({ name: 'file_size', type: 'integer', nullable: true })
  public fileSize!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
