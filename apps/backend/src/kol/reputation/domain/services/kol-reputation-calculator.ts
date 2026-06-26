import { KolReputation } from 'kol/reputation/domain/value-objects/kol-reputation.vo';
import {
  KolReputationAggregator,
  type KolReputationStats,
} from 'kol/reputation/domain/services/kol-reputation-aggregator';
import { KolReputationScorer } from 'kol/reputation/domain/services/kol-reputation-scorer';

interface KolReputationCanonicalCall {
  readonly chain: string;
  readonly address: string;
  readonly sources: ReadonlyArray<{ kolId: string | number }>;
  readonly lastSeenAt: Date;
}

/**
 * KolReputationCalculator — top-level entry point for computing a KOL's
 * reputation from canonical call data.
 *
 * Pipeline:
 * 1. KolReputationAggregator → stats (totalMentions, distinctTokens, time range)
 * 2. KolReputationScorer → { score, confidence } from stats
 * 3. KolReputation.fromValues → rich aggregate VO
 *
 * Pure function — no side effects, no DB access. The use case wraps this
 * with persistence and event emission.
 */
export class KolReputationCalculator {
  public static calculateFromCanonicalCalls(
    kolId: string,
    calls: ReadonlyArray<KolReputationCanonicalCall>,
  ): KolReputation {
    const stats: KolReputationStats = KolReputationAggregator.aggregate(
      kolId,
      calls,
    );
    const { score, confidence } = KolReputationScorer.score(stats);
    return KolReputation.fromValues({
      kolId,
      score,
      totalCalls: stats.totalMentions,
      strongCalls: 0,
      goodCalls: 0,
      neutralCalls: stats.totalMentions,
      poorCalls: 0,
      failedCalls: 0,
      avgAthMultiple: null,
      confidence,
    });
  }
}