import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `CallPerformance`.
 *
 * One row per evaluated call. The composite `(kolId, tokenId)` is the
 * natural identity but we use a surrogate `id` for ergonomic Postgres ops.
 *
 * `mcAtCall` is stored as numeric for precision; `athMultiple` as real
 * (float) since it's already a ratio.
 */
@Entity({ name: 'call_performances' })
@Index('idx_call_performances_channel', ['kolId'])
@Index('idx_call_performances_token', ['tokenId'])
@Index('idx_call_performances_evaluated_at', ['evaluatedAt'])
export class CallPerformanceEntity {
  @PrimaryGeneratedColumn('uuid')
  public id!: string;

  @Column({ name: 'kol_id', type: 'varchar', length: 64 })
  public kolId!: string;

  @Column({ name: 'token_id', type: 'varchar', length: 128 })
  public tokenId!: string;

  @Column({ name: 'outcome', type: 'varchar', length: 16 })
  public outcome!: string;

  @Column({
    name: 'mc_at_call',
    type: 'numeric',
    precision: 20,
    scale: 4,
    nullable: true,
  })
  public mcAtCall!: string | null;

  @Column({
    name: 'ath_multiple',
    type: 'real',
    nullable: true,
  })
  public athMultiple!: number | null;

  @Column({ name: 'call_timestamp', type: 'timestamptz' })
  public callTimestamp!: Date;

  @Column({ name: 'evaluated_at', type: 'timestamptz' })
  public evaluatedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
