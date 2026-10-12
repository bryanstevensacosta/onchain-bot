import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * TypeORM persistence shape for the single-row scheduling rotation
 * config (`feed_scheduling_config`, `id = 1`). NOT wired yet (GAP-1);
 * live reads use the in-memory adapter.
 *
 * R-c: canonical per-target columns are the `*DelayMinMs/*DelayMaxMs` +
 * `*ResetHour` pairs (6 new columns). The `*PublishDelayMs` scalars are
 * frozen legacy mirrors (read-only @deprecated, backfilled from the new
 * window max; removal at CUT).
 */
@Entity('feed_scheduling_config')
export class SchedulingConfigOrmEntity {
  @PrimaryColumn({ type: 'int' })
  public id!: number;

  @Column({ type: 'boolean', default: false })
  public enabled!: boolean;

  @Column({ type: 'int', default: 4 })
  public everyNPosts!: number;

  @Column({ type: 'int', default: 30 })
  public minMinutesBetweenAds!: number;

  /** @deprecated Legacy mirror of `telegramDelayMaxMs` (frozen, old route). */
  @Column({ type: 'bigint', default: 60000 })
  public telegramPublishDelayMs!: number;

  @Column({ type: 'int', default: 20 })
  public telegramDailyCap!: number;

  @Column({ type: 'bigint', default: 60000 })
  public telegramDelayMinMs!: number;

  @Column({ type: 'bigint', default: 60000 })
  public telegramDelayMaxMs!: number;

  @Column({ type: 'int', default: 0 })
  public telegramResetHour!: number;

  /** @deprecated Legacy mirror of `threadsDelayMaxMs` (frozen, old route). */
  @Column({ type: 'bigint', default: 60000 })
  public threadsPublishDelayMs!: number;

  @Column({ type: 'int', default: 20 })
  public threadsDailyCap!: number;

  @Column({ type: 'bigint', default: 60000 })
  public threadsDelayMinMs!: number;

  @Column({ type: 'bigint', default: 60000 })
  public threadsDelayMaxMs!: number;

  @Column({ type: 'int', default: 0 })
  public threadsResetHour!: number;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public createdAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public updatedAt!: Date;
}
