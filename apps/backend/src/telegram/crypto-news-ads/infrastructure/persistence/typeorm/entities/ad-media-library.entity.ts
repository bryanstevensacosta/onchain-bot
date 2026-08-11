import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for the shared ad-media library. One row per
 * uploaded asset (image/video/etc.) stored canonically under
 * `<UPLOADS_ROOT>/crypto-news-ads-library/<contentHash><ext>`.
 *
 * Table: `crypto_news_ad_media_library`. Deliberately has NO FK to
 * `crypto_news_ads` — library rows outlive any ad that references them
 * (deduplicated by `content_hash`, so many ads may share one library row).
 *
 * `file_path` and `content_hash` are both UNIQUE:
 *  - `file_path` guarantees a single canonical location per stored file;
 *  - `content_hash` makes `save` idempotent by content (re-uploading the
 *    same bytes finds the existing row instead of duplicating).
 *
 * NOTE: this is an ORM entity (infrastructure layer), NOT a domain entity —
 * it does not extend `AggregateRoot`, has no domain events, and is never
 * shared across BC boundaries directly.
 */
@Entity({ name: 'crypto_news_ad_media_library' })
export class AdMediaLibraryEntity {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  public id!: string;

  /** Path on disk, relative to `UPLOADS_ROOT`; served by the API. */
  @Column({ name: 'file_path', type: 'text' })
  public filePath!: string;

  /** SHA-256 of the file bytes — dedup key for idempotent uploads. */
  @Column({ name: 'content_hash', type: 'varchar', length: 64, unique: true })
  public contentHash!: string;

  /** Original client-provided filename (nullable for non-file uploads). */
  @Column({
    name: 'original_file_name',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  public originalFileName!: string | null;

  /** MIME detected from magic bytes at upload time (nullable on detection failure). */
  @Column({ name: 'mime_type', type: 'varchar', length: 64, nullable: true })
  public mimeType!: string | null;

  /** Byte size of the stored file (nullable for legacy backfilled rows). */
  @Column({ name: 'file_size', type: 'integer', nullable: true })
  public fileSize!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
