import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `CanonicalTokenCall`.
 *
 * One row per unique `(chain, address)` identity. The `sources` array is
 * stored as JSONB (Postgres native JSON). For 99% of query patterns we
 * only read scalar columns; `sources` is hydrated into the domain
 * `Source[]` array on full load.
 *
 * PG-specific column types — see `telegram-channel.entity.ts` for the
 * rationale and the trade-off of not having cross-driver unit tests.
 */
@Entity({ name: 'canonical_token_calls' })
@Index('idx_canonical_token_calls_last_seen', ['lastSeenAt'])
export class CanonicalTokenCallEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 128 })
  public id!: string;

  @PrimaryColumn({ name: 'chain', type: 'varchar', length: 16 })
  public chain!: string;

  @Column({ name: 'address', type: 'varchar', length: 128 })
  public address!: string;

  @Column({ name: 'ticker', type: 'varchar', length: 64, nullable: true })
  public ticker!: string | null;

  @Column({ name: 'name', type: 'varchar', length: 256, nullable: true })
  public name!: string | null;

  @Column({ name: 'chart', type: 'varchar', length: 512, nullable: true })
  public chart!: string | null;

  @Column({
    name: 'market_cap_usd',
    type: 'numeric',
    precision: 20,
    scale: 4,
    nullable: true,
  })
  public marketCapUsd!: string | null;

  @Column({
    name: 'liquidity_usd',
    type: 'numeric',
    precision: 20,
    scale: 4,
    nullable: true,
  })
  public liquidityUsd!: string | null;

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

  @Column({ name: 'sources', type: 'jsonb' })
  public sources!: Array<{
    channelId: string;
    username: string | null;
    messageIds: number[];
  }>;

  @Column({ name: 'mention_count', type: 'integer', default: 1 })
  public mentionCount!: number;

  @Column({ name: 'first_seen_at', type: 'timestamptz' })
  public firstSeenAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  public lastSeenAt!: Date;

  @Column({ name: 'last_confidence', type: 'real' })
  public lastConfidence!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  public updatedAt!: Date;
}
