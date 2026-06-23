import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { KolConfidence } from 'telegram-kol/reputation/domain/value-objects/kol-reputation.vo';

/**
 * TypeORM persistence shape for `KolReputation`.
 *
 * One row per KOL (PK = `kol_id`). Used by `scoring` BC's
 * `DefaultKolReputationAdapter` via `findByKol` — losing these
 * rows drops the kol-reputation multiplier on every score, so PG
 * persistence is what keeps the feature alive across restarts.
 *
 * PG-specific column types — see `kol.entity.ts` for the
 * rationale and the trade-off of not having cross-driver unit tests.
 */
@Entity({ name: 'kol_reputations' })
@Index('idx_kol_reputations_score', ['score'])
export class KolReputationEntity {
  @PrimaryColumn({ name: 'kol_id', type: 'varchar', length: 64 })
  public kolId!: string;

  @Column({ name: 'score', type: 'real' })
  public score!: number;

  @Column({ name: 'total_calls', type: 'integer', default: 0 })
  public totalCalls!: number;

  @Column({ name: 'strong_calls', type: 'integer', default: 0 })
  public strongCalls!: number;

  @Column({ name: 'good_calls', type: 'integer', default: 0 })
  public goodCalls!: number;

  @Column({ name: 'neutral_calls', type: 'integer', default: 0 })
  public neutralCalls!: number;

  @Column({ name: 'poor_calls', type: 'integer', default: 0 })
  public poorCalls!: number;

  @Column({ name: 'failed_calls', type: 'integer', default: 0 })
  public failedCalls!: number;

  @Column({
    name: 'avg_ath_multiple',
    type: 'real',
    nullable: true,
  })
  public avgAthMultiple!: number | null;

  @Column({ name: 'confidence', type: 'varchar', length: 16 })
  public confidence!: KolConfidence;

  @Column({ name: 'last_evaluated_at', type: 'timestamptz' })
  public lastEvaluatedAt!: Date;
}
