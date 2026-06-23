import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `ChainDetectionResult`.
 *
 * `scores` array (per-chain points) stored as JSONB. The `resolved_chain`
 * column is the winner of the score race (denormalized for query speed).
 */
@Entity({ name: 'chain_detection_results' })
@Index('idx_chain_detection_results_detected_at', ['detectedAt'])
export class ChainDetectionResultEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 128 })
  public id!: string;

  @Column({ name: 'address', type: 'varchar', length: 128 })
  public address!: string;

  @Column({ name: 'resolved_chain', type: 'varchar', length: 16 })
  public resolvedChain!: string;

  @Column({ name: 'confidence', type: 'real' })
  public confidence!: number;

  @Column({ name: 'is_contract', type: 'boolean', nullable: true })
  public isContract!: boolean | null;

  @Column({ name: 'scores', type: 'jsonb' })
  public scores!: Array<{
    chain: string;
    points: number;
    reasons: string[];
  }>;

  @Column({ name: 'detected_at', type: 'timestamptz' })
  public detectedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
