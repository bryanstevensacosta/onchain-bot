/**
 * KOL rating from call multiples (Tramo 1, todo 12).
 *
 * READ-ONLY reference (never imported, only mirrored):
 * - `apps/backend/src/token/call-tracking/domain/value-objects/outcome.vo.ts`
 *   (STRONG = ATH > 5x MC at call; GOOD > 2x; NEUTRAL 0.5–2x; POOR < 0.5x)
 * - `apps/backend/src/token/call-tracking/infrastructure/adapters/dexscreener-call-outcome-evaluator.adapter.ts`
 *   (`classifyOutcome`: FAILED when rugged, else the >=5 / >=2 / >=0.5 ladder;
 *   null/0 multiple → NEUTRAL = no-data)
 * - `apps/backend/src/token/achievement/` thresholds (milestone ladders
 *   2x, 3x, 5x…; defaults 2..100)
 *
 * Rating formula (kol +5x rating): each tracked call maps to an outcome
 * via the ladder above, outcomes map to backend `Outcome.weight()` values
 * (STRONG 1 / GOOD 0.5 / NEUTRAL 0 / POOR -0.3 / FAILED -0.8 — FAILED is
 * reserved for a future rug-signal input and never produced here), and
 * the kol score is the mean weight over its calls.
 *
 * Numeric example (pinned by spec): multiples [10x, 3x, 1x, 0.2x] →
 * outcomes [STRONG, GOOD, NEUTRAL, POOR] → weights (1 + 0.5 + 0 − 0.3)/4
 * = 0.3.
 */

export type KolOutcome = 'STRONG' | 'GOOD' | 'NEUTRAL' | 'POOR' | 'FAILED';

export const STRONG_THRESHOLD = 5;
export const GOOD_THRESHOLD = 2;
export const NEUTRAL_THRESHOLD = 0.5;

export function classifyMultiple(multiple: number | null): KolOutcome {
  if (multiple === null || !(multiple > 0)) {
    return 'NEUTRAL';
  }
  if (multiple >= STRONG_THRESHOLD) {
    return 'STRONG';
  }
  if (multiple >= GOOD_THRESHOLD) {
    return 'GOOD';
  }
  if (multiple >= NEUTRAL_THRESHOLD) {
    return 'NEUTRAL';
  }
  return 'POOR';
}

export function outcomeWeight(outcome: KolOutcome): number {
  switch (outcome) {
    case 'STRONG':
      return 1;
    case 'GOOD':
      return 0.5;
    case 'NEUTRAL':
      return 0;
    case 'POOR':
      return -0.3;
    case 'FAILED':
      return -0.8;
  }
}

export interface KolRating {
  readonly total: number;
  readonly strong: number;
  readonly good: number;
  readonly neutral: number;
  readonly poor: number;
  readonly failed: number;
  readonly score: number;
}

export function rateKol(multiples: ReadonlyArray<number | null>): KolRating {
  let strong = 0;
  let good = 0;
  let neutral = 0;
  let poor = 0;
  let failed = 0;
  let weightSum = 0;
  for (const multiple of multiples) {
    const outcome = classifyMultiple(multiple);
    weightSum += outcomeWeight(outcome);
    switch (outcome) {
      case 'STRONG':
        strong += 1;
        break;
      case 'GOOD':
        good += 1;
        break;
      case 'NEUTRAL':
        neutral += 1;
        break;
      case 'POOR':
        poor += 1;
        break;
      case 'FAILED':
        failed += 1;
        break;
    }
  }
  const total = multiples.length;
  return {
    total,
    strong,
    good,
    neutral,
    poor,
    failed,
    score: total === 0 ? 0 : weightSum / total,
  };
}
