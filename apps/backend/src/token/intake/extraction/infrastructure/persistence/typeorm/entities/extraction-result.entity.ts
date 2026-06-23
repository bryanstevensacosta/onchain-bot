import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

/**
 * TypeORM persistence shape for `ExtractionResult`.
 *
 * `contractAddresses`, `tickers`, `urls` are stored as JSONB. We keep
 * `chainHint` per address (vs auto-detection) because rehydration must
 * pick the right factory (`fromEvm` / `fromSolana` / `fromUnknown`).
 */
@Entity({ name: 'extraction_results' })
@Index('idx_extraction_results_occurred_at', ['occurredAt'])
export class ExtractionResultEntity {
  @PrimaryColumn({ name: 'id', type: 'varchar', length: 128 })
  public id!: string;

  @PrimaryColumn({ name: 'kol_id', type: 'varchar', length: 64 })
  public kolId!: string;

  @PrimaryColumn({ name: 'message_id', type: 'bigint' })
  public messageId!: string;

  @Column({ name: 'occurred_at', type: 'timestamptz' })
  public occurredAt!: Date;

  @Column({ name: 'contract_addresses', type: 'jsonb' })
  public contractAddresses!: Array<{
    value: string;
    chainHint: 'evm' | 'solana' | 'unknown';
  }>;

  @Column({ name: 'tickers', type: 'jsonb' })
  public tickers!: string[];

  @Column({ name: 'urls', type: 'jsonb' })
  public urls!: string[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  public createdAt!: Date;
}
