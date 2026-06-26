/**
 * KolScoreFormula — configurable weight set for the kol/reputation
 * blended score.
 *
 * score = mentionWeight * mentionScore
 *       + qualityWeight * qualityScore
 *       + drawdownWeight * drawdownScore
 *
 * Weights must sum to 1.0 (validated at construction).
 */
export interface KolScoreFormula {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly weights: {
    readonly mention: number;
    readonly quality: number;
    readonly drawdown: number;
  };
}

export class InvalidKolScoreFormula extends Error {
  constructor(public readonly reason: string) {
    super(`Invalid KolScoreFormula: ${reason}`);
  }
}

/**
 * Construct a `KolScoreFormula` validating that the weights sum to 1.0
 * (within `EPSILON`). Throws `InvalidKolScoreFormula` on invalid input.
 */
export function defineKolScoreFormula(
  id: string,
  name: string,
  description: string,
  weights: { mention: number; quality: number; drawdown: number },
): KolScoreFormula {
  const sum = weights.mention + weights.quality + weights.drawdown;
  const EPSILON = 0.0001;
  if (Math.abs(sum - 1) > EPSILON) {
    throw new InvalidKolScoreFormula(
      `weights must sum to 1.0, got ${sum.toFixed(4)} (mention=${weights.mention}, quality=${weights.quality}, drawdown=${weights.drawdown})`,
    );
  }
  if (weights.mention < 0 || weights.quality < 0 || weights.drawdown < 0) {
    throw new InvalidKolScoreFormula('weights must be non-negative');
  }
  return Object.freeze({ id, name, description, weights });
}

/**
 * Built-in formula presets.
 *
 * `default` — the original Slice 1 formula (mention 0.25 / quality 0.55
 *             / drawdown 0.20). Quality leads because outcome data is
 *             rarer than mention data.
 * `mention-heavy` — rewards prolific KOLs that name a lot of tokens.
 *                   Useful when outcome data is sparse.
 * `quality-heavy` — rewards KOLs whose tokens 5x/10x. Useful when
 *                   outcome data is abundant and the operator wants
 *                   to surface the highest-conviction callers.
 * `balanced` — even split. Useful as a tie-breaker or for head-to-head
 *              comparison of the KOL list across formulas.
 */
export const KOL_SCORE_FORMULAS: Readonly<Record<string, KolScoreFormula>> =
  Object.freeze({
    default: defineKolScoreFormula(
      'default',
      'Balanced (default)',
      'Quality-led (0.55). Use when outcome data is reliable.',
      { mention: 0.25, quality: 0.55, drawdown: 0.2 },
    ),
    'mention-heavy': defineKolScoreFormula(
      'mention-heavy',
      'Mention-heavy',
      'Activity-led (0.50). Use when outcome data is sparse.',
      { mention: 0.5, quality: 0.3, drawdown: 0.2 },
    ),
    'quality-heavy': defineKolScoreFormula(
      'quality-heavy',
      'Quality-heavy',
      'Conviction-led (0.70). Use when outcome data is abundant.',
      { mention: 0.15, quality: 0.7, drawdown: 0.15 },
    ),
    balanced: defineKolScoreFormula(
      'balanced',
      'Balanced (even split)',
      '0.33 / 0.34 / 0.33. Use for cross-formula comparison.',
      { mention: 0.33, quality: 0.34, drawdown: 0.33 },
    ),
  });

export const DEFAULT_KOL_SCORE_FORMULA_ID = 'default';

export function getKolScoreFormula(id: string): KolScoreFormula {
  const formula = KOL_SCORE_FORMULAS[id];
  if (!formula) {
    throw new InvalidKolScoreFormula(
      `unknown formula id "${id}". Valid: ${Object.keys(KOL_SCORE_FORMULAS).join(', ')}`,
    );
  }
  return formula;
}