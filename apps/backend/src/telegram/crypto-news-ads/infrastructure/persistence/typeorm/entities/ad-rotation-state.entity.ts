import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * TypeORM persistence shape for `AdRotationState`.
 *
 * Table: `crypto_news_ad_rotation_state` — single-row mutable state
 * for the ads rotation. Always exactly one row (`id = 1`); seeded by
 * the T3 provisioning backfill.
 */
@Entity({ name: 'crypto_news_ad_rotation_state' })
export class AdRotationStateEntity {
  @PrimaryColumn({ name: 'id', type: 'integer' })
  public id!: number;

  @Column({ name: 'posts_since_last_ad', type: 'integer', default: 0 })
  public postsSinceLastAd!: number;

  @Column({ name: 'last_ad_id', type: 'uuid', nullable: true })
  public lastAdId!: string | null;

  @Column({ name: 'last_ad_published_at', type: 'timestamptz', nullable: true })
  public lastAdPublishedAt!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
