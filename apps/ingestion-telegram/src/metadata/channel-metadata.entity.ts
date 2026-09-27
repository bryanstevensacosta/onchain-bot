import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  MetadataFetchStatus,
  MetadataKind,
  MetadataPeerType,
} from './metadata-kind';

/**
 * TypeORM entity for `telegram_channel_metadata` (P58 central metadata BC).
 *
 * ONE row per Telegram id: the full `getEntity` taxonomy
 * (kind/handle/phone-if-present/photo/url/type) persisted per
 * `.omo/evidence/mtproto-metadata-schema.md` §2.
 *
 * Ownership split (schema §4):
 * - `metadata/` OWNS identity (this table): kind, handle, photo, url, type.
 * - `registry/` (`telegram_feed_sources`) keeps subscription state
 *   (active/type) and mirrors display columns during dual-write; its
 *   columns are `@deprecated` mirrors, deleted after staging is green.
 *
 * PRIVACY (schema §2): `phone` is write-only at rest — `select: false`
 * (excluded from every repository read), absent from every DTO/projection
 * and every log. Any read is a PII incident. No index on `phone`.
 */
@Entity({ name: 'telegram_channel_metadata' })
export class TelegramChannelMetadataEntity {
  @PrimaryColumn({ name: 'channel_id', type: 'varchar', length: 64 })
  public channelId!: string;

  /**
   * Coarse taxonomy (schema §1 #2): `user|chat|channel`.
   * NULL = unresolved/min-shape (fail-open; kind guard skips the check).
   */
  @Column({ name: 'peer_type', type: 'varchar', length: 16, nullable: true })
  public peerType!: MetadataPeerType | null;

  /**
   * Fine taxonomy (P58 extension over the schema proposal):
   * `channel|supergroup|group|user|bot|unknown`.
   */
  @Column({ name: 'kind', type: 'varchar', length: 16, nullable: true })
  public kind!: MetadataKind | null;

  @Column({ name: 'title', type: 'varchar', length: 256 })
  public title!: string;

  /** User rows only (schema §1 #5). */
  @Column({ name: 'first_name', type: 'varchar', length: 128, nullable: true })
  public firstName!: string | null;

  /** User rows only (schema §1 #5). */
  @Column({ name: 'last_name', type: 'varchar', length: 128, nullable: true })
  public lastName!: string | null;

  /** Primary username (schema §1 #4). NULL for private channels. */
  @Column({ name: 'handle', type: 'varchar', length: 64, nullable: true })
  public handle!: string | null;

  /** Extra usernames (`usernames[]` vector, schema §1 #4). */
  @Column({ name: 'usernames', type: 'jsonb', nullable: true })
  public usernames!: string[] | null;

  /** Bio (GetFull path, schema §1 #10). */
  @Column({ name: 'about', type: 'text', nullable: true })
  public about!: string | null;

  @Column({ name: 'is_bot', type: 'boolean', default: false })
  public isBot!: boolean;

  @Column({ name: 'verified', type: 'boolean', default: false })
  public verified!: boolean;

  @Column({ name: 'is_scam', type: 'boolean', default: false })
  public isScam!: boolean;

  @Column({ name: 'is_fake', type: 'boolean', default: false })
  public isFake!: boolean;

  /** Exact member count (GetFull path, schema §1 #7). */
  @Column({ name: 'participants_count', type: 'integer', nullable: true })
  public participantsCount!: number | null;

  /**
   * User rows only (schema §1 #9). STORED, NEVER EXPOSED — `select: false`
   * keeps it out of every repository read; no DTO carries it; never logged.
   */
  @Column({
    name: 'phone',
    type: 'varchar',
    length: 32,
    nullable: true,
    select: false,
  })
  public phone!: string | null;

  /**
   * Avatar bookkeeping absorbed from `avatar/` (schema §2 + §3):
   * absolute path of the permanent photo under `uploads/avatar/`
   * (the FILE is the source of truth for serving).
   */
  @Column({ name: 'avatar_path', type: 'varchar', length: 512, nullable: true })
  public avatarPath!: string | null;

  @Column({ name: 'avatar_updated_at', type: 'timestamptz', nullable: true })
  public avatarUpdatedAt!: Date | null;

  /** Photo change detection (schema §2 #6). */
  @Column({ name: 'photo_dc_id', type: 'integer', nullable: true })
  public photoDcId!: number | null;

  /** Photo change detection (schema §2 #6). */
  @Column({
    name: 'photo_file_ref',
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  public photoFileRef!: string | null;

  @Column({
    name: 'fetch_status',
    type: 'varchar',
    length: 16,
    default: 'miss',
  })
  public fetchStatus!: MetadataFetchStatus;

  @CreateDateColumn({ name: 'fetched_at', type: 'timestamptz' })
  public fetchedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
