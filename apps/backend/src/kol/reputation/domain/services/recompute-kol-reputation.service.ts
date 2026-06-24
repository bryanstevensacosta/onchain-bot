import { CallPerformance } from 'token/call-tracking/domain/value-objects/call-performance.vo';
import {
  KolReputation,
  KolConfidence,
} from 'kol/reputation/domain/value-objects/kol-reputation.vo';

/**
 * Pure function: compute KolReputation from a list of performances.
 *
 * Algorithm:
 * - score = clamp(0.5 + weighted_mean(outcome.weight), 0, 1)
 * - confidence = based on total call count
 * - counts and avg ATH per outcome tier
 */
export function recomputeKolReputation(
  kolId: string,
  perfs: ReadonlyArray<CallPerformance>,
): KolReputation {
  const totalCalls = perfs.length;
  let strong = 0,
    good = 0,
    neutral = 0,
    poor = 0,
    failed = 0;
  let weightedSum = 0;
  let athSum = 0,
    athCount = 0;

  for (const p of perfs) {
    switch (p.outcome.value) {
      case 'STRONG':
        strong++;
        break;
      case 'GOOD':
        good++;
        break;
      case 'NEUTRAL':
        neutral++;
        break;
      case 'POOR':
        poor++;
        break;
      case 'FAILED':
        failed++;
        break;
    }
    weightedSum += p.outcome.weight();
    if (p.athMultiple !== null) {
      athSum += p.athMultiple;
      athCount++;
    }
  }

  const avgOutcomeWeight = totalCalls === 0 ? 0 : weightedSum / totalCalls;
  const rawScore = 0.5 + avgOutcomeWeight * 0.5; // each outcome contributes +/-0..0.5
  const score = Math.max(0, Math.min(1, Math.round(rawScore * 100) / 100));
  const avgAth = athCount === 0 ? null : athSum / athCount;

  let confidence: KolConfidence;
  if (totalCalls >= 50) confidence = 'VERY_HIGH';
  else if (totalCalls >= 20) confidence = 'HIGH';
  else if (totalCalls >= 5) confidence = 'MEDIUM';
  else confidence = 'LOW';

  return KolReputation.fromValues({
    kolId,
    score,
    totalCalls,
    strongCalls: strong,
    goodCalls: good,
    neutralCalls: neutral,
    poorCalls: poor,
    failedCalls: failed,
    avgAthMultiple: avgAth,
    confidence,
  });
}
