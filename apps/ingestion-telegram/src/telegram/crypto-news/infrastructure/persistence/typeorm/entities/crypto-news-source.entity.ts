import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * TypeORM entity for `crypto_news_sources` table.
 *
 * Read-only in ingestion-service — sources are created/updated via backend API.
 * Ingestion-service queries this table to determine which channels to monitor
 * and which ones require media download (crypto-news vs KOL).
 *
 * Replaces the deprecated seed-based approach (CRYPTO_NEWS_SEED + env var).
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
  public lifecycleStatus!: 'ACTIVE' | 'INACTIVE';

  @CreateDateColumn({ name: 'added_at', type: 'timestamptz' })
  public addedAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
