import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `FilterDecision`.
 *
 * Indexed on `decided_at` (recent), `verdict` (approved/rejected), and
 * the composite PK `(id)` which is `${chain}:${address}` — one decision
 * per token, re-filtering overwrites.
 *
 * `reasons` is stored as JSONB since the structure is heterogeneous
 * (each reason has a code and message).
 */
@Entity({ name: 'filter_decisions' })
@Index('idx_filter_decisions_decided_at', ['decidedAt'])
@Index('idx_filter_decisions_verdict', ['verdict'])
export class FilterDecisionEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 128 })
  public id!: string;

  @PrimaryColumn({ name: 'chain', type: 'varchar', length: 16 })
  public chain!: string;

  @Column({ name: 'address', type: 'varchar', length: 128 })
  public address!: string;

  @Column({ name: 'verdict', type: 'varchar', length: 16 })
  public verdict!: string;

  @Column({ name: 'score', type: 'integer' })
  public score!: number;

  @Column({ name: 'classification', type: 'varchar', length: 32 })
  public classification!: string;

  @Column({ name: 'reasons', type: 'jsonb' })
  public reasons!: Array<{
    code: string;
    message: string;
  }>;

  @Column({ name: 'decided_at', type: 'timestamptz' })
  public decidedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
