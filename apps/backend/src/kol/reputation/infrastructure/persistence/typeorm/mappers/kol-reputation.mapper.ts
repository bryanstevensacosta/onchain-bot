/**
 * @deprecated Tramo 1 cutover (task-16, staging): KOL rating moved to
 * apps/kol-calls/src/tracking (TrackedMention + kol_window_stats +
 * GET /api/kol-rankings). Refactor target: delete this file at the
 * central FINAL REVIEW (C4-bis.3). Rollback: backend path stays wired.
 */
import { KolReputation } from 'kol/reputation/domain/value-objects/kol-reputation.vo';
import { EMPTY_KOL_REPUTATION_METRICS } from 'kol/reputation/domain/value-objects/kol-reputation-metrics.vo';
import { KolReputationEntity } from 'kol/reputation/infrastructure/persistence/typeorm/entities/kol-reputation.entity';

export class KolReputationMapper {
  public static toEntity(stats: KolReputation): KolReputationEntity {
    const row = new KolReputationEntity();
    row.kolId = stats.kolId;
    row.score = stats.score;
    row.metrics = stats.metrics;
    row.confidence = stats.confidence;
    row.lastEvaluatedAt = stats.lastEvaluatedAt;
    return row;
  }

  public static toDomain(row: KolReputationEntity): KolReputation {
    return KolReputation.fromValues({
      kolId: row.kolId,
      score: row.score,
      metrics: row.metrics ?? EMPTY_KOL_REPUTATION_METRICS,
      confidence: row.confidence,
      lastEvaluatedAt: row.lastEvaluatedAt,
    });
  }
}
