import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'notified_milestones' })
@Index('idx_notified_milestones_call_id', ['callId'])
@Index('uq_notified_milestones_call_threshold', ['callId', 'threshold'], {
  unique: true,
})
export class NotifiedMilestoneEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'call_id', type: 'varchar', nullable: false })
  callId!: string;

  @Column({ type: 'float', nullable: false })
  threshold!: number;

  @Column({ name: 'notified_at', type: 'timestamptz', nullable: false })
  notifiedAt!: Date;
}
