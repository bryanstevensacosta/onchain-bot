import { Column, Entity, Index, OneToMany, PrimaryColumn } from 'typeorm';
import { TelegramFeedMessageMediaEntity } from './telegram-feed-message-media.entity';

/**
 * Feed message type discriminator.
 *
 * `feed` rows are backfilled by the `TelegramFeedMessages` migration
 * (RENAME of `crypto_news_messages`); `kol` rows arrive with item 7
 * (coordinator persist path). Same union the coordinator `route()` accepts.
 */
export type TelegramFeedMessageType = 'kol' | 'crypto-news';

/**
 * TypeORM persistence shape for a unified feed message.
 *
 * Table: `telegram_feed_messages` — created by RENAME of
 * `crypto_news_messages` (rows preserved, no copy) + `type` discriminator
 * column backfilled to `'crypto-news'`. Composite uniqueness on
 * (channel_id, message_id) to prevent duplicate ingestion.
 *
 * NOTE: the `media` join targets `TelegramFeedMessageMediaEntity`
 * (item 4 rename). Postgres `RENAME TABLE` keeps the FK working by OID,
 * so cascade + eager loads behave identically pre/post rename.
 *
 * NOTE: this is NOT the domain entity.
 */
@Entity({ name: 'telegram_feed_messages' })
@Index('idx_telegram_feed_messages_channel_id', ['channelId'])
@Index('idx_telegram_feed_messages_ingested_at', ['ingestedAt'])
@Index(
  'uq_telegram_feed_messages_channel_message',
  ['channelId', 'messageId'],
  {
    unique: true,
  },
)
export class TelegramFeedMessageEntity {
  @PrimaryColumn({ name: 'id', type: 'uuid' })
  public id!: string;

  @Column({ name: 'channel_id', type: 'varchar', length: 64 })
  public channelId!: string;

  @Column({ name: 'message_id', type: 'integer' })
  public messageId!: number;

  /**
   * Feed discriminator: which registry type produced this row.
   * Backfilled to `'crypto-news'` for all renamed rows; item 7 persists
   * `'kol'` rows with RAW content (no media, per policy C2).
   */
  @Column({
    name: 'type',
    type: 'varchar',
    length: 16,
    default: 'crypto-news',
  })
  public type!: TelegramFeedMessageType;

  @Column({ name: 'title', type: 'varchar', length: 512, nullable: true })
  public title!: string | null;

  @Column({ name: 'content', type: 'text' })
  public content!: string;

  @Column({ name: 'published_at', type: 'timestamptz' })
  public publishedAt!: Date;

  @Column({ name: 'ingested_at', type: 'timestamptz' })
  public ingestedAt!: Date;

  @Column({ name: 'link_preview_url', type: 'text', nullable: true })
  public linkPreviewUrl!: string | null;

  @Column({ name: 'link_preview_title', type: 'text', nullable: true })
  public linkPreviewTitle!: string | null;

  @Column({ name: 'link_preview_description', type: 'text', nullable: true })
  public linkPreviewDescription!: string | null;

  @Column({
    name: 'link_preview_site_name',
    type: 'varchar',
    length: 128,
    nullable: true,
  })
  public linkPreviewSiteName!: string | null;

  /**
   * Telegram text entities (links, mentions, hashtags) as a JSON array.
   *
   * Stored as `jsonb` (GIN index
   * `idx_telegram_feed_messages_entities_gin`, recreated by the
   * `TelegramFeedMessages` migration — TypeORM 0.3.30 cannot express
   * `using:gin` in metadata, so dev `synchronize:true` boots destroy the
   * GIN while staging/prod `synchronize:false` keep it; re-create in dev
   * with `CREATE INDEX IF NOT EXISTS ... USING GIN` after boot). The
   * `string` union member covers pre-migration TEXT rows during rollout:
   * node-pg returns `jsonb` parsed but TEXT as a raw string — readers must
   * accept both (`''`/unparseable → `[]`, never abort).
   */
  @Column({ name: 'message_entities', type: 'jsonb', nullable: true })
  public messageEntities!:
    | Array<{ type: string; offset: number; length: number; url?: string }>
    | string
    | null;

  @Column({ name: 'grouped_id', type: 'varchar', length: 64, nullable: true })
  public groupedId!: string | null;

  /**
   * Photo attachments for this message. Same cascade/eager semantics as the
   * pre-rename entity (see `TelegramFeedMessageMediaEntity` for why
   * `onDelete` lives on `@ManyToOne`). FK re-point to the renamed table
   * is item 4 (this file's media join already targets the renamed class).
   */
  @OneToMany(() => TelegramFeedMessageMediaEntity, (m) => m.message, {
    cascade: ['insert', 'update'],
    eager: true,
  })
  public media!: TelegramFeedMessageMediaEntity[];
}
