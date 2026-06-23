import { KolReputation } from 'telegram-kol/reputation/domain/value-objects/kol-reputation.vo';
import { KolReputationEntity } from 'telegram-kol/reputation/infrastructure/persistence/typeorm/entities/kol-reputation.entity';

export class KolReputationMapper {
  public static toEntity(stats: KolReputation): KolReputationEntity {
    const row = new KolReputationEntity();
    row.kolId = stats.kolId;
    row.score = stats.score;
    row.totalCalls = stats.totalCalls;
    row.strongCalls = stats.strongCalls;
    row.goodCalls = stats.goodCalls;
    row.neutralCalls = stats.neutralCalls;
    row.poorCalls = stats.poorCalls;
    row.failedCalls = stats.failedCalls;
    row.avgAthMultiple = stats.avgAthMultiple;
    row.confidence = stats.confidence;
    row.lastEvaluatedAt = stats.lastEvaluatedAt;
    return row;
  }

  public static toDomain(row: KolReputationEntity): KolReputation {
    return KolReputation.fromValues({
      kolId: row.kolId,
      score: row.score,
      totalCalls: row.totalCalls,
      strongCalls: row.strongCalls,
      goodCalls: row.goodCalls,
      neutralCalls: row.neutralCalls,
      poorCalls: row.poorCalls,
      failedCalls: row.failedCalls,
      avgAthMultiple: row.avgAthMultiple,
      confidence: row.confidence,
      lastEvaluatedAt: row.lastEvaluatedAt,
    });
  }
}
