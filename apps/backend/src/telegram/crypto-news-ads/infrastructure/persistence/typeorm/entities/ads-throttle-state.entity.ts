import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * TypeORM persistence shape backing the ads shared-throttle state.
 *
 * Table: `crypto_news_ads_throttle_state` — singleton row (`id = 1`)
 * holding the most-recent ads publish timestamp. This is the ads-BC
 * table bound to the SAME `SharedThrottleStateRepository` contract as
 * the news `crypto_news_publisher_throttle_state` table, but on its
 * own row so news and ads jitter independently.
 */
@Entity({ name: 'crypto_news_ads_throttle_state' })
export class AdsThrottleStateEntity {
  @PrimaryColumn({ name: 'id', type: 'integer' })
  public id!: number;

  @Column({ name: 'last_publish_at', type: 'timestamptz', nullable: true })
  public lastPublishAt!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
