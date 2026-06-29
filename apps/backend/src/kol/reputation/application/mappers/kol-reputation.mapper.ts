import type { KolReputation } from 'kol/reputation/domain/value-objects/kol-reputation.vo';

/**
 * Outbound view model: KOL reputation summary for API/UI consumers.
 *
 * Replaces the previous fixed `totalCalls` / `strongCalls` / `neutralCalls`
 * / etc. fields with the dynamic `metrics` object. New outcome
 * categories (X2/X5/X10/rug-50/rug-80) are added in `metrics` without
 * schema changes.
 */
export interface KolReputationView {
  readonly kolId: string;
  readonly score: number;
  readonly metrics: {
    readonly totalMentions: number;
    readonly x2Count: number;
    readonly x5Count: number;
    readonly x10Count: number;
    readonly x50Count: number;
    readonly rug50Count: number;
    readonly rug80Count: number;
    readonly neutralCount: number;
    readonly mentionScore: number;
    readonly qualityScore: number;
    readonly drawdownScore: number;
  };
  readonly confidence: string;
  readonly isTrusted: boolean;
  readonly isSuspicious: boolean;
  readonly lastEvaluatedAt: string;
}

export class KolReputationMapper {
  public static toView(stats: KolReputation): KolReputationView {
    return {
      kolId: stats.kolId,
      score: stats.score,
      metrics: stats.metrics,
      confidence: stats.confidence,
      isTrusted: stats.isTrusted,
      isSuspicious: stats.isSuspicious,
      lastEvaluatedAt: stats.lastEvaluatedAt.toISOString(),
    };
  }
}
