import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `Ad`.
 *
 * Table: `crypto_news_ads`. The `@Unique(['name'])` constraint is
 * REQUIRED so the T8 controller's duplicate-name → 409 path can fire
 * (mirrors `llm-config.controller.ts:136`).
 *
 * NOTE: this is NOT the domain aggregate. The domain entity lives at
 * `telegram/crypto-news-ads/domain/entities/ad.entity.ts`.
 */
@Entity({ name: 'crypto_news_ads' })
@Unique('uq_crypto_news_ads_name', ['name'])
@Index('idx_crypto_news_ads_enabled_order', ['enabled', 'order'])
export class AdEntity {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({ name: 'name', type: 'varchar', length: 128 })
  public name!: string;

  @Column({ name: 'body', type: 'text' })
  public body!: string;

  @Column({ name: 'image_path', type: 'varchar', length: 512, nullable: true })
  public imagePath!: string | null;

  @Column({ name: 'enabled', type: 'boolean', default: true })
  public enabled!: boolean;

  /** Quoted: `order` is a reserved word in SQL. */
  @Column({ name: 'order', type: 'integer', default: 0 })
  public order!: number;

  @Column({ name: 'times_published', type: 'integer', default: 0 })
  public timesPublished!: number;

  @Column({ name: 'consecutive_failures', type: 'integer', default: 0 })
  public consecutiveFailures!: number;

  @Column({ name: 'last_published_at', type: 'timestamptz', nullable: true })
  public lastPublishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
