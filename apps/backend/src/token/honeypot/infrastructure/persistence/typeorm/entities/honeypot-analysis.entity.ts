import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `HoneypotAnalysis`.
 *
 * `signals` array stored as JSONB. Booleans (canSell, canBuy, etc.) are
 * nullable — null means "unknown / not analyzed". Indexed on
 * `risk` and `analyzed_at` for filter queries.
 */
@Entity({ name: 'honeypot_analyses' })
@Index('idx_honeypot_analyses_risk', ['risk'])
@Index('idx_honeypot_analyses_analyzed_at', ['analyzedAt'])
export class HoneypotAnalysisEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 128 })
  public id!: string;

  @PrimaryColumn({ name: 'chain', type: 'varchar', length: 16 })
  public chain!: string;

  @Column({ name: 'address', type: 'varchar', length: 128 })
  public address!: string;

  @Column({ name: 'risk', type: 'varchar', length: 16 })
  public risk!: string;

  @Column({ name: 'signals', type: 'jsonb' })
  public signals!: Array<{
    type: string;
    severity: string;
    description: string;
  }>;

  @Column({ name: 'buy_tax', type: 'real', nullable: true })
  public buyTax!: number | null;

  @Column({ name: 'sell_tax', type: 'real', nullable: true })
  public sellTax!: number | null;

  @Column({ name: 'transfer_tax', type: 'real', nullable: true })
  public transferTax!: number | null;

  @Column({ name: 'can_sell', type: 'boolean', nullable: true })
  public canSell!: boolean | null;

  @Column({ name: 'can_buy', type: 'boolean', nullable: true })
  public canBuy!: boolean | null;

  @Column({ name: 'owner_can_drain', type: 'boolean', nullable: true })
  public ownerCanDrain!: boolean | null;

  @Column({ name: 'owner_renounced', type: 'boolean', nullable: true })
  public ownerRenounced!: boolean | null;

  @Column({ name: 'is_proxy', type: 'boolean', nullable: true })
  public isProxy!: boolean | null;

  @Column({ name: 'analysis_source', type: 'varchar', length: 16 })
  public analysisSource!: string;

  @Column({ name: 'analyzed_at', type: 'timestamptz' })
  public analyzedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
