import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Unified feed source type discriminator.
 *
 * - `feed`: opaque news channels (media download enabled, RAW text kept)
 * - `kol`: KOL channels (no media by policy; identity migrates here in item 6)
 */
export type TelegramFeedSourceType = 'kol' | 'crypto-news';

/**
 * TypeORM entity for `telegram_feed_sources` table.
 *
 * Unified catalog absorbing `crypto_news_sources` rows (type='crypto-news',
 * cloned by migration) and — from item 6 — backend `kols` rows (type='kol').
 *
 * The old `crypto_news_sources` table stays live until plan item 5; this
 * table is write-quiet until then (reads only via the new repository).
 *
 * P58 subscription slimming: this catalog keeps SUBSCRIPTION state
 * (channel_id/type/is_active/lifecycle_status/last_ingested_at). Identity
 * (handle/title/url/avatar/entityKind/isBot) is OWNED by `metadata/`
 * (`telegram_channel_metadata`, referenced by the same channel id); the
 * columns below are `@deprecated` dual-write mirrors, deleted after
 * staging is green (schema §4 step 5). Do not add new identity columns.
 */
@Entity({ name: 'telegram_feed_sources' })
@Index('idx_telegram_feed_sources_lifecycle_status', ['lifecycleStatus'])
@Index('idx_telegram_feed_sources_type', ['type'])
export class TelegramFeedSourceEntity {
  @PrimaryColumn({ name: 'channel_id', type: 'varchar', length: 64 })
  public channelId!: string;

  /**
   * @deprecated P58 dual-write mirror of `metadata.handle` (identity owned
   * by `telegram_channel_metadata`). Read-dead after cutover; deleted after
   * staging is green.
   */
  @Column({ name: 'handle', type: 'varchar', length: 64, nullable: true })
  public handle!: string | null;

  /**
   * @deprecated P58 dual-write mirror of `metadata.title`.
   */
  @Column({ name: 'title', type: 'varchar', length: 256 })
  public title!: string;

  @Column({ name: 'type', type: 'varchar', length: 16 })
  public type!: TelegramFeedSourceType;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  public isActive!: boolean;

  @Column({
    name: 'lifecycle_status',
    type: 'varchar',
    length: 16,
    default: 'ACTIVE',
  })
  public lifecycleStatus!: 'ACTIVE' | 'INACTIVE';

  @Column({ name: 'last_ingested_at', type: 'timestamptz', nullable: true })
  public lastIngestedAt!: Date | null;

  /**
   * KOL avatar bookkeeping (Tramo 1, todo 13, P19).
   *
   * @deprecated P58 dual-write mirror of `metadata.avatar_path` (absorbed
   * into `metadata/`). Read-dead after cutover; deleted after staging green.
   *
   * Absolute path of the permanent photo under `uploads/avatar/` (served at
   * `GET /api/kol-avatar/:channelId`). NULL = never fetched or MTProto miss
   * (placeholder served). The FILE is the source of truth for serving; these
   * columns are bookkeeping only. Nullable so pre-avatar rows stay valid;
   * excluded from the 72h janitor with the files (janitor touches only
   * `telegram_feed_message*` + `uploads/feed-media/`).
   */
  @Column({ name: 'avatar_path', type: 'varchar', length: 512, nullable: true })
  public avatarPath!: string | null;

  @Column({ name: 'avatar_updated_at', type: 'timestamptz', nullable: true })
  public avatarUpdatedAt!: Date | null;

  /**
   * P57 entity-kind bookkeeping (central todo 11).
   *
   * @deprecated P58 dual-write mirror of `metadata.kind`/`metadata.is_bot`.
   * Read-dead after cutover; deleted after staging is green.
   *
   * Real MTProto taxonomy captured at registration (`channel` |
   * `supergroup` | `group` | `user` | `bot` | `unknown`). NULL = resolved
   * before the kind-resolver existed, or MTProto was unreachable at
   * registration (fail-open). Rows with `user`/`bot` predate the guard
   * and are skipped by the subscribe filter — never deleted silently.
   * Full per-id metadata lives in the P58 `metadata/` track (follow-up).
   */
  @Column({ name: 'entity_kind', type: 'varchar', length: 16, nullable: true })
  public entityKind!: string | null;

  @Column({ name: 'is_bot', type: 'boolean', nullable: true })
  public isBot!: boolean | null;

  /**
   * P57 public link (central todo 12).
   *
   * @deprecated P58: derived from `metadata.handle` (`sourceUrlFor`).
   * Mirror deleted after staging is green.
   *
   * `https://t.me/<handle>` for handle-bearing channels, NULL for
   * private handle-less channels (no guessed URLs). Recomputed whenever
   * the handle changes (register / batch / PATCH). Display-only: the
   * listener subscribes by `channel_id`, never by this URL.
   */
  @Column({ name: 'url', type: 'varchar', length: 256, nullable: true })
  public url!: string | null;

  @CreateDateColumn({ name: 'added_at', type: 'timestamptz' })
  public addedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
