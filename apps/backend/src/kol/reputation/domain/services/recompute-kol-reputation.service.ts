import { CallPerformance } from 'token/call-tracking/domain/value-objects/call-performance.vo';
import {
  KolReputation,
} from 'kol/reputation/domain/value-objects/kol-reputation.vo';

/**
 * Legacy pure function: compute KolReputation from a list of call
 * performances.
 *
 * Today the call_performances table is empty (call/lifecycle BC not
 * yet built), so this function effectively returns a neutral 0.5
 * reputation for every KOL. The canonical path is
 * `KolReputationCalculator.calculateFromCanonicalCalls` which reads
 * from `canonical_token_calls.sources[]` (always populated).
 *
 * When call/lifecycle ships and starts emitting
 * `CallMilestoneUnlockedEvent`s, the calculator can be extended to
 * incorporate ATH-based counts (x2/x5/x10/rug50/rug80) in addition
 * to the mention counts, and this legacy function can be removed.
 */
export function recomputeKolReputation(
  kolId: string,
  perfs: ReadonlyArray<CallPerformance>,
): KolReputation {
  if (perfs.length === 0) {
    return KolReputation.fromValues({
      kolId,
      score: 0.5,
      metrics: {
        totalMentions: 0,
        x2Count: 0,
        x5Count: 0,
        x10Count: 0,
        x50Count: 0,
        rug50Count: 0,
        rug80Count: 0,
        neutralCount: 0,
        mentionScore: 0.5,
        qualityScore: 0.5,
        drawdownScore: 0.5,
      },
      confidence: 'LOW',
    });
  }
  // When perfs become non-empty (call/lifecycle ships), translate the
  // outcomes into metrics counts here. For now return neutral.
  return KolReputation.fromValues({
    kolId,
    score: 0.5,
    metrics: {
      totalMentions: perfs.length,
      x2Count: 0,
      x5Count: 0,
      x10Count: 0,
      x50Count: 0,
      rug50Count: 0,
      rug80Count: 0,
      neutralCount: perfs.length,
      mentionScore: 0.5,
      qualityScore: 0.5,
      drawdownScore: 0.5,
    },
    confidence: 'LOW',
  });
}