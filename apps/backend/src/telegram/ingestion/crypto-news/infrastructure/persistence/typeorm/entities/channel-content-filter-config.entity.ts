import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `ChannelContentFilterConfig`.
 *
 * Table: `channel_content_filter_configs` — per-channel regex filters applied
 * to incoming crypto-news message content before persistence. Each filter
 * defines a `pattern` (regex) and optional `replacement` string with `flags`
 * (default 'gi'). Filters are evaluated in `priority` order (ascending),
 * then by `created_at` for deterministic tie-breaking.
 *
 * `channel_id` is an OPAQUE varchar with NO FK — opaque by design, not by
 * omission. Crypto-news sources are owned by ingestion-telegram in its own
 * `<base>_ingestion` DB, so the backend keeps no JOIN to
 * `crypto_news_sources`: a cross-DB foreign key is impossible (separate
 * Postgres databases) and undesirable (it would recouple the split). The
 * JOIN to sources was removed in the ownership split of 2026-09-08
 * (migration `1860000000001-DropIngestionOwnedCryptoNewsTables` dropped both
 * historical FK names — the synchronize-era `FK_f4d53649fee70f18bbc88502673`
 * and the `1815000000000`-era `fk_channel_content_filter_configs_channel_id`
 * — and deliberately does NOT re-add them in `down()`). Filter use-cases
 * validate source existence as a warning only (log + proceed, never throw):
 * orphan rules for unknown channels are kept, and matching simply yields no
 * filters for them. See `docs/architecture/crypto-news-schema-ownership.md`.
 */
@Entity({ name: 'channel_content_filter_configs' })
@Index('idx_channel_content_filter_configs_ordering', [
  'channelId',
  'priority',
  'createdAt',
])
export class ChannelContentFilterConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  /**
   * Opaque Telegram channel id (numeric string, e.g. "-1001234567890").
   * Deliberately FK-less: the referenced `crypto_news_sources` table lives
   * in ingestion-telegram's `<base>_ingestion` DB, not in the backend DB
   * (split 2026-09-08). Never add a `@ManyToOne` here.
   */
  @Column({ name: 'channel_id', type: 'varchar', length: 64 })
  public channelId!: string;

  @Column({ name: 'pattern', type: 'varchar', length: 512 })
  public pattern!: string;

  @Column({ name: 'replacement', type: 'varchar', length: 512, default: '' })
  public replacement!: string;

  @Column({ name: 'flags', type: 'varchar', length: 8, default: 'gi' })
  public flags!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  public isActive!: boolean;

  @Column({ name: 'priority', type: 'int', default: 0 })
  public priority!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
