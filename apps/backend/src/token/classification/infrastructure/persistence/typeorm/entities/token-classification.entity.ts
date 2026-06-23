import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `TokenClassification`.
 *
 * `signals` array is stored as JSONB (PG native). `riskWeight` and
 * `highestSeverity` are denormalized scalar projections of the signals
 * array for fast filtering (no need to JSON-parse for the most common
 * query patterns).
 */
@Entity({ name: 'token_classifications' })
@Index('idx_token_classifications_classified_at', ['classifiedAt'])
export class TokenClassificationEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 128 })
  public id!: string;

  @PrimaryColumn({ name: 'chain', type: 'varchar', length: 16 })
  public chain!: string;

  @Column({ name: 'address', type: 'varchar', length: 128 })
  public address!: string;

  @Column({ name: 'classification', type: 'varchar', length: 32 })
  public classification!: string;

  @Column({ name: 'security_flag', type: 'varchar', length: 32 })
  public securityFlag!: string;

  @Column({ name: 'confidence', type: 'real' })
  public confidence!: number;

  @Column({ name: 'risk_weight', type: 'integer', default: 0 })
  public riskWeight!: number;

  @Column({
    name: 'highest_severity',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  public highestSeverity!: string | null;

  @Column({ name: 'snapshot_completeness', type: 'real' })
  public snapshotCompleteness!: number;

  @Column({ name: 'signals', type: 'jsonb' })
  public signals!: Array<{
    type: string;
    severity: string;
    description: string;
  }>;

  @Column({ name: 'classified_at', type: 'timestamptz' })
  public classifiedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
