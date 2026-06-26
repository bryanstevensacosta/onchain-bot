import {
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `TokenScore`.
 *
 * One row per unique `(chain, address)` identity. The `scoredAt` column
 * is the wall-clock time the score was computed (denormalized from
 * domain state for query convenience).
 *
 * PG-specific column types — see `telegram-channel.entity.ts` for the
 * rationale and the trade-off of not having cross-driver unit tests.
 */
@Entity({ name: 'token_scores' })
@Index('idx_token_scores_scored_at', ['scoredAt'])
@Index('idx_token_scores_score', ['score'])
export class TokenScoreEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 128 })
  public id!: string;

  @PrimaryColumn({ name: 'chain', type: 'varchar', length: 16 })
  public chain!: string;

  @Column({ name: 'address', type: 'varchar', length: 128 })
  public address!: string;

  @Column({ name: 'score', type: 'integer' })
  public score!: number;

  @Column({ name: 'tier', type: 'varchar', length: 16 })
  public tier!: string;

  @Column({ name: 'classification', type: 'varchar', length: 32 })
  public classification!: string;

  @Column({ name: 'source_count', type: 'integer', default: 1 })
  public sourceCount!: number;

  @Column({ name: 'mention_count', type: 'integer', default: 1 })
  public mentionCount!: number;

  @Column({ name: 'avg_channel_reputation', type: 'real', default: 0.5 })
  public avgKolReputation!: number;

  @Column({ name: 'scored_at', type: 'timestamptz' })
  public scoredAt!: Date;

  @Column({ name: 'breakdown', type: 'jsonb', nullable: true })
  public breakdown!: Array<{
    factor: string;
    delta: number;
    note: string;
  }> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @BeforeInsert()
  @BeforeUpdate()
  lowercaseId() {
    if (this.id) this.id = this.id.toLowerCase();
  }
}
