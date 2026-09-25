import { Injectable } from '@nestjs/common';

export type DedupZone = 'duplicate' | 'different' | 'gray_zone';

export interface DedupScoreInput {
  readonly semantic: number;
  readonly jaccard: number;
  readonly urlOverlap: number;
  readonly minutesApart: number;
  readonly numberJaccard: number;
  readonly entityJaccard: number;
  readonly cashtagJaccard: number;
  readonly hasNumbers?: boolean;
  readonly hasEntities?: boolean;
  readonly hasCashtags?: boolean;
}

export interface DedupScore {
  readonly score: number;
  readonly zone: DedupZone;
}

/**
 * Dedup scorer (moved from backend shared/deduplication dedup-scorer,
 * todo 4; thresholds pinned from the backend DEFAULT_CONFIG).
 *
 * score = semantic + (jaccard-0.3)*0.2 + urlBoost + proximityBoost -
 * penalties, clamped [0,1]. duplicate > 0.95, different < 0.6, else
 * gray_zone (fail-open: the cascade never blocks on gray).
 */
@Injectable()
export class DedupScorerService {
  public readonly duplicateThreshold = 0.95;
  public readonly grayZoneMin = 0.6;
  private readonly urlBoost = 0.15;
  private readonly proximityBoost = 0.1;
  private readonly proximityWindowMinutes = 30;
  private readonly jaccardWeight = 0.2;
  private readonly numberPenalty = 0.15;
  private readonly entityPenalty = 0.12;
  private readonly cashtagPenalty = 0.15;

  public computeScore(input: DedupScoreInput): DedupScore {
    let score =
      input.semantic +
      (input.jaccard - 0.3) * this.jaccardWeight +
      (input.urlOverlap > 0 ? this.urlBoost : 0) +
      (input.minutesApart <= this.proximityWindowMinutes
        ? this.proximityBoost
        : 0);
    if (input.hasNumbers === true && input.numberJaccard < 0.5) {
      score -= this.numberPenalty;
    }
    if (input.hasEntities === true && input.entityJaccard < 0.3) {
      score -= this.entityPenalty;
    }
    if (input.hasCashtags === true && input.cashtagJaccard < 0.5) {
      score -= this.cashtagPenalty;
    }
    score = Math.max(0, Math.min(1, score));
    const zone: DedupZone =
      score > this.duplicateThreshold
        ? 'duplicate'
        : score < this.grayZoneMin
          ? 'different'
          : 'gray_zone';
    return { score, zone };
  }

  public jaccard(a: ReadonlyArray<string>, b: ReadonlyArray<string>): number {
    const setA = new Set(a);
    const setB = new Set(b);
    if (setA.size === 0 && setB.size === 0) {
      return 1;
    }
    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) {
        intersection += 1;
      }
    }
    const union = setA.size + setB.size - intersection;
    return union === 0 ? 1 : intersection / union;
  }
}
