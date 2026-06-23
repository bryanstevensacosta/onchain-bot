import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `CallEvaluationJob`.
 *
 * The id is a composite string `${kolId}:${chain}:${address}:${horizon}:${tsMs}`
 * (deterministic from the domain factory). We use it as the primary key
 * so re-enqueueing the same call is idempotent at the DB level.
 *
 * Indexed on `(status, scheduledAt)` for the main query pattern:
 * "find next batch of PENDING jobs whose scheduledAt <= now".
 */
@Entity({ name: 'call_evaluation_jobs' })
@Index('idx_call_evaluation_jobs_due', ['status', 'scheduledAt'])
export class CallEvaluationJobEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 256 })
  public id!: string;

  @Column({ name: 'kol_id', type: 'varchar', length: 64 })
  public kolId!: string;

  @Column({ name: 'chain', type: 'varchar', length: 16 })
  public chain!: string;

  @Column({ name: 'address', type: 'varchar', length: 128 })
  public address!: string;

  @Column({ name: 'horizon', type: 'varchar', length: 8 })
  public horizon!: string;

  @Column({ name: 'status', type: 'varchar', length: 16 })
  public status!: string;

  @Column({ name: 'attempts', type: 'integer', default: 0 })
  public attempts!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  public lastError!: string | null;

  @Column({ name: 'call_timestamp', type: 'timestamptz' })
  public callTimestamp!: Date;

  @Column({
    name: 'mc_at_call',
    type: 'numeric',
    precision: 20,
    scale: 4,
    nullable: true,
  })
  public mcAtCall!: string | null;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  public scheduledAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  public completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
