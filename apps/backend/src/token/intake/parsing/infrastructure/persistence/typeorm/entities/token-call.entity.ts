import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `TokenCall`.
 *
 * `contract` is stored as JSONB. `metrics` (TokenMetrics VO) flattens
 * into individual columns for queryability (liquidity, MC, holders, etc.).
 *
 * Indexed on `occurred_at` for the "recent" query pattern.
 */
@Entity({ name: 'token_calls' })
@Index('idx_token_calls_occurred_at', ['occurredAt'])
export class TokenCallEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 128 })
  public id!: string;

  @PrimaryColumn({ name: 'kol_id', type: 'varchar', length: 64 })
  public kolId!: string;

  @PrimaryColumn({ name: 'message_id', type: 'bigint' })
  public messageId!: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  public occurredAt!: Date;

  @Column({ name: 'contract', type: 'jsonb' })
  public contract!: {
    value: string;
    chainHint: 'evm' | 'solana' | 'unknown';
  };

  @Column({ name: 'ticker', type: 'varchar', length: 64, nullable: true })
  public ticker!: string | null;

  @Column({ name: 'name', type: 'varchar', length: 256, nullable: true })
  public name!: string | null;

  @Column({ name: 'chart', type: 'varchar', length: 512, nullable: true })
  public chart!: string | null;

  @Column({
    name: 'liquidity_usd',
    type: 'numeric',
    precision: 20,
    scale: 4,
    nullable: true,
  })
  public liquidityUsd!: string | null;

  @Column({
    name: 'market_cap_usd',
    type: 'numeric',
    precision: 20,
    scale: 4,
    nullable: true,
  })
  public marketCapUsd!: string | null;

  @Column({
    name: 'fdv_usd',
    type: 'numeric',
    precision: 20,
    scale: 4,
    nullable: true,
  })
  public fdvUsd!: string | null;

  @Column({ name: 'holders', type: 'integer', nullable: true })
  public holders!: number | null;

  @Column({ name: 'confidence', type: 'real' })
  public confidence!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
