import type { KolReputation } from 'kol/reputation/domain/value-objects/kol-reputation.vo';

/**
 * Outbound view model: KOL reputation summary for API/UI consumers.
 */
export interface KolReputationView {
  readonly kolId: string;
  readonly score: number;
  readonly totalCalls: number;
  readonly strongCalls: number;
  readonly goodCalls: number;
  readonly neutralCalls: number;
  readonly poorCalls: number;
  readonly failedCalls: number;
  readonly successRate: number;
  readonly failureRate: number;
  readonly avgAthMultiple: number | null;
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
      totalCalls: stats.totalCalls,
      strongCalls: stats.strongCalls,
      goodCalls: stats.goodCalls,
      neutralCalls: stats.neutralCalls,
      poorCalls: stats.poorCalls,
      failedCalls: stats.failedCalls,
      successRate: Math.round(stats.successRate() * 100) / 100,
      failureRate: Math.round(stats.failureRate() * 100) / 100,
      avgAthMultiple: stats.avgAthMultiple,
      confidence: stats.confidence,
      isTrusted: stats.isTrusted,
      isSuspicious: stats.isSuspicious,
      lastEvaluatedAt: stats.lastEvaluatedAt.toISOString(),
    };
  }
}
