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
 * TypeORM persistence shape for `TokenSnapshot`.
 *
 * `pairs` is stored as JSONB (heterogeneous per-pair shape); `sources`
 * is a simple string array. Numeric metrics use `numeric(20,4)` for
 * precision on liquidity/MC/volume figures.
 */
@Entity({ name: 'token_snapshots' })
@Index('idx_token_snapshots_enriched_at', ['enrichedAt'])
export class TokenSnapshotEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 128 })
  public id!: string;

  @PrimaryColumn({ name: 'chain', type: 'varchar', length: 16 })
  public chain!: string;

  @Column({ name: 'address', type: 'varchar', length: 128 })
  public address!: string;

  @Column({ name: 'pairs', type: 'jsonb' })
  public pairs!: Array<{
    address: string;
    dexId: string;
    quoteToken: string;
    reserveUsd: number;
  }>;

  @Column({ name: 'primary_pair', type: 'jsonb', nullable: true })
  public primaryPair!: {
    address: string;
    dexId: string;
    quoteToken: string;
    reserveUsd: number;
  } | null;

  @Column({
    name: 'price_usd',
    type: 'numeric',
    precision: 20,
    scale: 8,
    nullable: true,
  })
  public priceUsd!: string | null;

  @Column({
    name: 'liquidity_usd',
    type: 'numeric',
    precision: 20,
    scale: 4,
    nullable: true,
  })
  public liquidityUsd!: string | null;

  @Column({
    name: 'volume_24h_usd',
    type: 'numeric',
    precision: 20,
    scale: 4,
    nullable: true,
  })
  public volume24hUsd!: string | null;

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

  @Column({ name: 'price_change_24h', type: 'real', nullable: true })
  public priceChange24h!: number | null;

  @Column({ name: 'holders', type: 'integer', nullable: true })
  public holders!: number | null;

  @Column({ name: 'top10_holder_percent', type: 'real', nullable: true })
  public top10HolderPercent!: number | null;

  @Column({ name: 'name', type: 'varchar', length: 256, nullable: true })
  public name!: string | null;

  @Column({
    name: 'image_urls',
    type: 'jsonb',
    default: () => "'[]'",
    nullable: false,
  })
  public imageUrls!: string[];

  @Column({ name: 'locked_liquidity_percent', type: 'real', nullable: true })
  public lockedLiquidityPercent!: number | null;

  @Column({ name: 'burned_percent', type: 'real', nullable: true })
  public burnedPercent!: number | null;

  @Column({ name: 'sources', type: 'jsonb' })
  public sources!: string[];

  @Column({ name: 'enriched_at', type: 'timestamptz' })
  public enrichedAt!: Date;

  @Column({ name: 'snapshot_completeness', type: 'real', nullable: true })
  public snapshotCompleteness!: number | null;

  @Column({ name: 'provider_errors', type: 'jsonb', nullable: true })
  public providerErrors!: Array<{ provider: string; message: string }> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;

  @BeforeInsert()
  @BeforeUpdate()
  lowercaseId() {
    if (this.id) this.id = this.id.toLowerCase();
  }

  @BeforeInsert()
  @BeforeUpdate()
  lowercaseImageUrls() {
    if (Array.isArray(this.imageUrls)) {
      this.imageUrls = this.imageUrls.map((u) => u.toLowerCase());
    }
  }
}
