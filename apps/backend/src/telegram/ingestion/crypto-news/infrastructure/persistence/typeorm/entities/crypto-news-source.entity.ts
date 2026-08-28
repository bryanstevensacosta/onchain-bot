import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { CryptoNewsSourceLifecycleStatus } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';

/** JSON shape for ChannelContentFilterConfig (mirrors ChannelContentFilterConfigEntity fields). */
export interface ChannelContentFilterConfigJson {
  pattern: string;
  replacement?: string;
  flags?: string;
  isActive?: boolean;
  priority?: number;
}

/**
 * TypeORM persistence shape for `CryptoNewsSource`.
 *
 * Table: `crypto_news_sources` — registry of Telegram channels ingested
 * as crypto-news sources. Keyed by `channel_id` (Telegram peer id).
 *
 * NOTE: this is NOT the domain aggregate. The domain entity lives at
 * `telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity.ts`
 * and owns invariants + domain events. The mapper translates between
 * the two so the domain stays pure.
 */
@Entity({ name: 'crypto_news_sources' })
@Index('idx_crypto_news_sources_lifecycle_status', ['lifecycleStatus'])
export class CryptoNewsSourceEntity {
  @PrimaryColumn({ name: 'channel_id', type: 'varchar', length: 64 })
  public channelId!: string;

  @Column({ name: 'handle', type: 'varchar', length: 64, nullable: true })
  public handle!: string | null;

  @Column({ name: 'title', type: 'varchar', length: 256 })
  public title!: string;

  @Column({ name: 'is_active', type: 'boolean', default: false })
  public isActive!: boolean;

  @Column({
    name: 'lifecycle_status',
    type: 'varchar',
    length: 16,
    default: 'ACTIVE',
  })
  public lifecycleStatus!: CryptoNewsSourceLifecycleStatus;

  @CreateDateColumn({ name: 'added_at', type: 'timestamptz' })
  public addedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;

  @Column({ name: 'filter_config', type: 'jsonb', nullable: true })
  public filterConfig!: ChannelContentFilterConfigJson | null;
}
