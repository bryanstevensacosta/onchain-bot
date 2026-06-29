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
