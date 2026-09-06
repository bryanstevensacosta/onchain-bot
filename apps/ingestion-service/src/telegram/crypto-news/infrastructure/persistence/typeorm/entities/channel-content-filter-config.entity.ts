import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { CryptoNewsSourceEntity } from './crypto-news-source.entity';

/**
 * TypeORM persistence shape for `ChannelContentFilterConfig`.
 *
 * Table: `channel_content_filter_configs` — per-channel regex filters applied
 * to incoming crypto-news message content before persistence. Each filter
 * defines a `pattern` (regex) and optional `replacement` string with `flags`
 * (default 'gi'). Filters are evaluated in `priority` order (ascending),
 * then by `created_at` for deterministic tie-breaking.
 *
 * FK to `crypto_news_sources.channel_id` with CASCADE delete ensures
 * filters are removed when their parent news source is deleted.
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

  @ManyToOne(() => CryptoNewsSourceEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_id', referencedColumnName: 'channelId' })
  public source!: CryptoNewsSourceEntity;

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
