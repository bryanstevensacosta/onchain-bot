/**
 * @deprecated Moved to apps/kol-calls/src/extraction/ (Tramo 1, todo 5 + P18 companion).
 * Extraction per-mention now lives in kol-calls: ExtractFromMessageUseCase (direct call,
 * fix-1, no event bus; multi-tip NO collapse, one row per mention) + snapshot base emit.
 * This file stays wired for dual-run; it will be removed in todo 16 (cutover + cleanup).
 * Do not extend it — add extraction logic in apps/kol-calls/src/extraction/ instead.
 *
 * New location: apps/kol-calls/src/extraction/
 * Reason: extracting KOL pipeline from backend monolith to dedicated app
 * Breaking change: Yes (removal in todo 16)
 * Rollback: re-enable backend path (KOL_PIPELINE_ENABLED=true)
 */
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
