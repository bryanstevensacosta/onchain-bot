/**
 * @deprecated Moved to apps/feed-publisher/src/scheduling/ (Tramo 2, todo 6 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add scheduling/ads logic in apps/feed-publisher/src/scheduling/ instead.
 */
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `AdRotationConfig`.
 *
 * Table: `crypto_news_ad_rotation_config` — single-row configuration
 * for the ads rotation. Always exactly one row (`id = 1`); seeded by
 * the T3 provisioning backfill.
 */
@Entity({ name: 'crypto_news_ad_rotation_config' })
export class AdRotationConfigEntity {
  @PrimaryColumn({ name: 'id', type: 'integer' })
  public id!: number;

  @Column({ name: 'enabled', type: 'boolean', default: false })
  public enabled!: boolean;

  @Column({ name: 'every_n_posts', type: 'integer', default: 4 })
  public everyNPosts!: number;

  @Column({ name: 'min_minutes_between_ads', type: 'integer', default: 30 })
  public minMinutesBetweenAds!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
