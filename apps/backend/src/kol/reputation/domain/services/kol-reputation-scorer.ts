import type { KolConfidence } from 'kol/reputation/domain/value-objects/kol-reputation.vo';

export interface KolReputationScore {
  readonly score: number;
  readonly confidence: KolConfidence;
}

/**
 * KolReputationScorer — converts mention stats into a 0..1 reputation score.
 *
 * Algorithm: log-scaled activity score around 0.5 (neutral default).
 * - 0 mentions       → 0.50 (neutral, no data)
 * - 1 mention        → ~0.55 (very low confidence)
 * - 5 mentions       → ~0.65
 * - 15 mentions      → ~0.75
 * - 50 mentions      → ~0.85
 * - 500+ mentions    → ~0.95 (capped)
 *
 * Confidence thresholds match the existing KolConfidence scale
 * (LOW < 5, MEDIUM 5-19, HIGH 20-49, VERY_HIGH 50+).
 */
export class KolReputationScorer {
  public static score(stats: {
    readonly totalMentions: number;
  }): KolReputationScore {
    if (stats.totalMentions === 0) {
      return { score: 0.5, confidence: 'LOW' };
    }
    const raw = 0.5 + Math.log10(stats.totalMentions + 1) * 0.2;
    const score = Math.min(0.95, Math.max(0, Math.round(raw * 100) / 100));
    let confidence: KolConfidence;
    if (stats.totalMentions >= 50) confidence = 'VERY_HIGH';
    else if (stats.totalMentions >= 20) confidence = 'HIGH';
    else if (stats.totalMentions >= 5) confidence = 'MEDIUM';
    else confidence = 'LOW';
    return { score, confidence };
  }
}