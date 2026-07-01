import type { KolReputationMetrics } from 'kol/reputation/domain/value-objects/kol-reputation-metrics.vo';

interface KolMetricsCanonicalCallSource {
  readonly kolId: string | number;
  readonly mentionCount?: number;
}

interface KolMetricsCanonicalCall {
  readonly chain: string;
  readonly address: string;
  readonly sources: ReadonlyArray<KolMetricsCanonicalCallSource>;
}

/**
 * KolMetricsCalculator — produces the dynamic `KolReputationMetrics`
 * shape from raw data (canonical calls + outcome events).
 *
 * Today: counts mentions from `canonical_token_calls.sources[]`.
 * Tomorrow (INV-18 call/lifecycle): also counts outcomes (X2/X5/X10/etc)
 * from `CallMilestoneUnlockedEvent`s.
 *
 * The score sub-calculations (mentionScore, qualityScore, drawdownScore)
 * live here as well so the math is in one place.
 */
export class KolMetricsCalculator {
  public static calculate(
    kolId: string,
    calls: ReadonlyArray<KolMetricsCanonicalCall>,
  ): KolReputationMetrics {
    const totalMentions = KolMetricsCalculator.countMentions(kolId, calls);
    const mentionScore =
      KolMetricsCalculator.computeMentionScore(totalMentions);

    // Outcome counts stay 0 until call/lifecycle BC ships.
    // The shape is in place so adding them later is a code change,
    // not a schema migration.
    const qualityScore = KolMetricsCalculator.computeQualityScore(0, 0, 0, 0);
    const drawdownScore = KolMetricsCalculator.computeDrawdownScore(0, 0);

    return {
      totalMentions,
      x2Count: 0,
      x5Count: 0,
      x10Count: 0,
      x50Count: 0,
      rug50Count: 0,
      rug80Count: 0,
      neutralCount: totalMentions,
      mentionScore,
      qualityScore,
      drawdownScore,
    };
  }

  public static countMentions(
    kolId: string,
    calls: ReadonlyArray<KolMetricsCanonicalCall>,
  ): number {
    const targetKolId = String(kolId);
    let count = 0;
    for (const call of calls) {
      if (!Array.isArray(call.sources)) continue;
      for (const source of call.sources as ReadonlyArray<KolMetricsCanonicalCallSource>) {
        if (String(source.kolId) !== targetKolId) continue;
        count += source.mentionCount ?? 1;
      }
    }
    return count;
  }

  /**
   * Log-scaled activity score. Pure volume signal.
   * 0 mentions → 0.50 (neutral)
   * 1 → ~0.55, 5 → ~0.65, 15 → ~0.75, 50 → ~0.85, 500+ → 0.95 (capped)
   */
  public static computeMentionScore(totalMentions: number): number {
    if (totalMentions === 0) return 0.5;
    const raw = 0.5 + Math.log10(totalMentions + 1) * 0.2;
    return Math.min(0.95, Math.max(0, Math.round(raw * 100) / 100));
  }

  /**
   * Quality from outcomes. Today: 0.5 (neutral) because no outcomes
   * are tracked yet. When call/lifecycle ships, this will become:
   * (x2Count*1 + x5Count*2 + x10Count*3 + x50Count*5) / max(1, totalCalls)
   * capped at 1.0.
   */
  public static computeQualityScore(
    x2Count: number,
    x5Count: number,
    x10Count: number,
    x50Count: number,
  ): number {
    const totalWeighted =
      x2Count * 1 + x5Count * 2 + x10Count * 3 + x50Count * 5;
    if (totalWeighted === 0) return 0.5;
    const totalCalls = x2Count + x5Count + x10Count + x50Count;
    const rate = totalWeighted / Math.max(1, totalCalls);
    return Math.min(1, Math.max(0, Math.round(rate * 100) / 100));
  }

  /**
   * Drawdown penalty (0..1, 1 = no rugs).
   * 0 rugs → 1.0
   * Many rugs → lower score.
   * Each rug-50 = -0.1, each rug-80 = -0.2 (per call)
   */
  public static computeDrawdownScore(
    rug50Count: number,
    rug80Count: number,
  ): number {
    const totalCalls = rug50Count + rug80Count;
    if (totalCalls === 0) return 0.5;
    const penalty = (rug50Count * 0.1 + rug80Count * 0.2) / totalCalls;
    return Math.max(0, Math.min(1, Math.round((1 - penalty) * 100) / 100));
  }
}
