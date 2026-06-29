import { KolReputation } from 'kol/reputation/domain/value-objects/kol-reputation.vo';
import type { KolConfidence } from 'kol/reputation/domain/value-objects/kol-reputation.vo';
import { KolMetricsCalculator } from 'kol/reputation/domain/services/kol-metrics-calculator';
import {
  DEFAULT_KOL_SCORE_FORMULA_ID,
  KOL_SCORE_FORMULAS,
  type KolScoreFormula,
} from 'kol/reputation/domain/value-objects/kol-score-formula.vo';

interface KolReputationCanonicalCall {
  readonly chain: string;
  readonly address: string;
  readonly sources: ReadonlyArray<{
    kolId: string | number;
    mentionCount?: number;
  }>;
  readonly lastSeenAt: Date;
}

const KNOWN_GOOD_MULTIPLIER = 1.2;
const KNOWN_BAD_MULTIPLIER = 0.5;

/**
 * KolReputationCalculator — top-level entry point for computing a KOL's
 * reputation from canonical call data.
 *
 * Pipeline:
 * 1. KolMetricsCalculator → KolReputationMetrics (counts + per-metric scores)
 * 2. Compute blended score from the 3 metric scores (mention / quality / drawdown)
 *    using a configurable `KolScoreFormula` (default: `default`).
 * 3. Apply whitelist/blacklist multiplier if applicable
 * 4. Derive confidence from metrics.totalMentions
 * 5. KolReputation.fromValues → rich aggregate VO
 *
 * Pure function — no side effects, no DB access.
 */
export class KolReputationCalculator {
  public static calculateFromCanonicalCalls(
    kolId: string,
    calls: ReadonlyArray<KolReputationCanonicalCall>,
    formulaId: string = DEFAULT_KOL_SCORE_FORMULA_ID,
  ): KolReputation {
    return KolReputationCalculator.calculate(
      kolId,
      calls,
      null,
      null,
      formulaId,
    );
  }

  public static calculate(
    kolId: string,
    calls: ReadonlyArray<KolReputationCanonicalCall>,
    knownGood: boolean | null,
    knownBad: boolean | null,
    formulaId: string = DEFAULT_KOL_SCORE_FORMULA_ID,
  ): KolReputation {
    const formula =
      KOL_SCORE_FORMULAS[formulaId] ??
      KOL_SCORE_FORMULAS[DEFAULT_KOL_SCORE_FORMULA_ID];
    const metrics = KolMetricsCalculator.calculate(kolId, calls);
    const blended = KolReputationCalculator.blendScore(metrics, formula);
    const adjusted = KolReputationCalculator.applyWhitelist(
      blended,
      knownGood,
      knownBad,
    );
    const score = Math.min(1, Math.max(0, Math.round(adjusted * 100) / 100));
    const confidence = KolReputationCalculator.deriveConfidence(
      metrics.totalMentions,
    );
    return KolReputation.fromValues({
      kolId,
      score,
      metrics,
      confidence,
    });
  }

  public static blendScore(
    metrics: {
      readonly mentionScore: number;
      readonly qualityScore: number;
      readonly drawdownScore: number;
    },
    formula: KolScoreFormula = KOL_SCORE_FORMULAS[DEFAULT_KOL_SCORE_FORMULA_ID],
  ): number {
    return (
      metrics.mentionScore * formula.weights.mention +
      metrics.qualityScore * formula.weights.quality +
      metrics.drawdownScore * formula.weights.drawdown
    );
  }

  public static applyWhitelist(
    score: number,
    knownGood: boolean | null,
    knownBad: boolean | null,
  ): number {
    if (knownGood === true) return score * KNOWN_GOOD_MULTIPLIER;
    if (knownBad === true) return score * KNOWN_BAD_MULTIPLIER;
    return score;
  }

  public static deriveConfidence(totalMentions: number): KolConfidence {
    if (totalMentions < 5) return 'LOW';
    if (totalMentions < 20) return 'MEDIUM';
    if (totalMentions < 50) return 'HIGH';
    return 'VERY_HIGH';
  }
}
