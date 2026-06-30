import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

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
}
