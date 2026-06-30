import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export interface NotifiedAchievementProps {
  id?: string;
  callId: string;
  threshold: number;
  notifiedAt: Date;
  telegramMessageId?: number | null;
}

@Entity({ name: 'notified_achievements' })
@Index('idx_notified_achievements_call_id', ['callId'])
@Index('uq_notified_achievements_call_threshold', ['callId', 'threshold'], {
  unique: true,
})
export class NotifiedAchievementEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'call_id', type: 'varchar', nullable: false })
  callId!: string;

  @Column({ type: 'float', nullable: false })
  threshold!: number;

  @Column({ name: 'notified_at', type: 'timestamptz', nullable: false })
  notifiedAt!: Date;

  @Column({ name: 'telegram_message_id', type: 'bigint', nullable: true })
  telegramMessageId?: number | null;

  static create(props: NotifiedAchievementProps): NotifiedAchievementEntity {
    const entity = new NotifiedAchievementEntity();
    entity.id = props.id;
    entity.callId = props.callId;
    entity.threshold = props.threshold;
    entity.notifiedAt = props.notifiedAt;
    entity.telegramMessageId = props.telegramMessageId ?? null;
    return entity;
  }

  static rehydrate(row: NotifiedAchievementEntity): NotifiedAchievementEntity {
    const entity = new NotifiedAchievementEntity();
    entity.id = row.id;
    entity.callId = row.callId;
    entity.threshold = row.threshold;
    entity.notifiedAt = row.notifiedAt;
    entity.telegramMessageId = row.telegramMessageId;
    return entity;
  }
}
