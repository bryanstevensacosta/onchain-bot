import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Represents a published token call that is being monitored for milestones.
 * One row per published call within the active window.
 */
@Entity({ name: 'monitored_calls' })
@Index('idx_monitored_calls_published_at', ['publishedAt'])
@Index('idx_monitored_calls_chain_address', ['chain', 'address'])
export class MonitoredCallEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'call_id', type: 'varchar', nullable: false, unique: true })
  callId!: string;

  @Column({ type: 'varchar', nullable: false })
  chain!: string;

  @Column({ type: 'varchar', nullable: false })
  address!: string;

  /**
   * Market cap (USD) captured at publish time. Serves as the baseline for milestone computation.
   */
  @Column({ name: 'mc_at_call', type: 'float', nullable: false })
  mcAtCall!: number;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: false })
  publishedAt!: Date;

  @Column({ name: 'last_evaluated_at', type: 'timestamptz', nullable: true })
  lastEvaluatedAt!: Date | null;
}
