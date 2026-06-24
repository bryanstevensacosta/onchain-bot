import { ScoringThresholdEntity } from 'settings/infrastructure/persistence/typeorm/entities/scoring-threshold.entity';
import { ThresholdConfig } from 'settings/domain/types/threshold-config';

export const ThresholdMapper = {
  toDomain(entity: ScoringThresholdEntity): ThresholdConfig {
    return {
      id: entity.id,
      scope: entity.scope,
      minScore: entity.minScore,
      maxScore: entity.maxScore,
      decision: entity.decision,
    };
  },

  toEntity(config: Partial<ThresholdConfig>): ScoringThresholdEntity {
    const e = new ScoringThresholdEntity();
    if (config.id !== undefined) e.id = config.id;
    if (config.scope !== undefined) e.scope = config.scope;
    if (config.minScore !== undefined) e.minScore = config.minScore;
    if (config.maxScore !== undefined) e.maxScore = config.maxScore;
    if (config.decision !== undefined) e.decision = config.decision;
    return e;
  },
};
