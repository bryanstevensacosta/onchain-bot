import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { KolConfidence } from 'kol/reputation/domain/value-objects/kol-reputation.vo';
import type { KolReputationMetrics } from 'kol/reputation/domain/value-objects/kol-reputation-metrics.vo';

/**
 * TypeORM persistence shape for `KolReputation`.
 *
 * The dynamic `metrics` jsonb column replaces the previous fixed
 * `strong_calls` / `good_calls` / `neutral_calls` / `poor_calls` /
 * `failed_calls` columns. Adding new outcome categories (e.g. X20
 * count) is now a code change in `KolMetricsCalculator`, not a
 * schema migration.
 */
@Entity({ name: 'kol_reputations' })
@Index('idx_kol_reputations_score', ['score'])
export class KolReputationEntity {
  @PrimaryColumn({ name: 'kol_id', type: 'varchar', length: 64 })
  public kolId!: string;

  @Column({ name: 'score', type: 'real' })
  public score!: number;

  @Column({ name: 'metrics', type: 'jsonb' })
  public metrics!: KolReputationMetrics;

  @Column({ name: 'confidence', type: 'varchar', length: 16 })
  public confidence!: KolConfidence;

  @Column({ name: 'last_evaluated_at', type: 'timestamptz' })
  public lastEvaluatedAt!: Date;
}