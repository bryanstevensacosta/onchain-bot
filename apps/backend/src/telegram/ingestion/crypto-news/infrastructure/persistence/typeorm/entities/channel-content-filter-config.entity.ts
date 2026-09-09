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
 * `channel_id` is an OPAQUE varchar with NO FK (db-separation todo 4):
 * crypto-news sources are owned by ingestion-service in its own DB, so the
 * backend keeps no JOIN to `crypto_news_sources`. Orphan rules for unknown
 * channels are kept (matching simply yields no filters for them).
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
