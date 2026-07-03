import {
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * TypeORM persistence model for the `vip_notified_achievements` table owned by
 * the `vip-achievement` sub-BC under `telegram/vip-calls/`.
 *
 * The two index decorators MUST keep these names — they match the explicit
 * `ALTER INDEX ... RENAME TO ...` statements in the Wave-4 SQL migration that
 * renamed the table from `notified_achievements` to `vip_notified_achievements`.
 * If the names drift, `synchronize: true` in dev will DROP and recreate the
 * indexes (lock + brief write unavailability).
 *
 * This file is purely a persistence concern: no domain logic, no factories,
 * no behaviour. Domain shape is defined in
 * `../../domain/entities/vip-achievement.entity.ts`; this class is the
 * TypeORM-side mirror of those fields.
 */
@Entity({ name: 'vip_notified_achievements' })
@Index('idx_vip_notified_achievements_call_id', ['callId'])
@Index('uq_vip_notified_achievements_call_threshold', ['callId', 'threshold'], {
  unique: true,
})
export class VipAchievementEntity {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({ name: 'call_id', type: 'varchar', nullable: false })
  public callId!: string;

  @Column({ type: 'float', nullable: false })
  public threshold!: number;

  @Column({ name: 'notified_at', type: 'timestamptz', nullable: false })
  public notifiedAt!: Date;

  @Column({ name: 'telegram_message_id', type: 'bigint', nullable: true })
  public telegramMessageId!: number | null;
}