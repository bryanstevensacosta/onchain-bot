import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * TypeORM persistence shape for the single-row scheduling rotation
 * state (`feed_scheduling_state`, `id = 1`). NOT wired yet (GAP-1);
 * live reads use the in-memory adapter.
 */
@Entity('feed_scheduling_state')
export class SchedulingStateOrmEntity {
  @PrimaryColumn({ type: 'int' })
  public id!: number;

  @Column({ type: 'int', default: 0 })
  public postsSinceLastAd!: number;

  @Column({ type: 'uuid', nullable: true })
  public telegramLastAdId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  public telegramLastPublishedAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  public telegramPublishedToday!: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  public telegramDayKey!: string | null;

  @Column({ type: 'uuid', nullable: true })
  public threadsLastAdId!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  public threadsLastPublishedAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  public threadsPublishedToday!: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  public threadsDayKey!: string | null;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  public updatedAt!: Date;
}
