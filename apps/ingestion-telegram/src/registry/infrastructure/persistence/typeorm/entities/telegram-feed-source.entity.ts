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
 * - `crypto-news`: opaque news channels (media download enabled, RAW text kept)
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
 */
@Entity({ name: 'telegram_feed_sources' })
@Index('idx_telegram_feed_sources_lifecycle_status', ['lifecycleStatus'])
@Index('idx_telegram_feed_sources_type', ['type'])
export class TelegramFeedSourceEntity {
  @PrimaryColumn({ name: 'channel_id', type: 'varchar', length: 64 })
  public channelId!: string;

  @Column({ name: 'handle', type: 'varchar', length: 64, nullable: true })
  public handle!: string | null;

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

  @CreateDateColumn({ name: 'added_at', type: 'timestamptz' })
  public addedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
