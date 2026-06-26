/**
 * KolScoreFormula — configurable weight set for the kol/reputation
 * blended score (frontend mirror of the backend VO).
 *
 * Mirrors `apps/backend/src/kol/reputation/domain/value-objects/kol-score-formula.vo.ts`.
 * Keep both in sync — the API validates the id against the same registry.
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

export const KOL_SCORE_FORMULAS: Readonly<Record<string, KolScoreFormula>> =
  Object.freeze({
    default: {
      id: 'default',
      name: 'Balanced (default)',
      description: 'Quality-led (0.55). Use when outcome data is reliable.',
      weights: { mention: 0.25, quality: 0.55, drawdown: 0.2 },
    },
    'mention-heavy': {
      id: 'mention-heavy',
      name: 'Mention-heavy',
      description: 'Activity-led (0.50). Use when outcome data is sparse.',
      weights: { mention: 0.5, quality: 0.3, drawdown: 0.2 },
    },
    'quality-heavy': {
      id: 'quality-heavy',
      name: 'Quality-heavy',
      description: 'Conviction-led (0.70). Use when outcome data is abundant.',
      weights: { mention: 0.15, quality: 0.7, drawdown: 0.15 },
    },
    balanced: {
      id: 'balanced',
      name: 'Balanced (even split)',
      description: '0.33 / 0.34 / 0.33. Use for cross-formula comparison.',
      weights: { mention: 0.33, quality: 0.34, drawdown: 0.33 },
    },
  });

export const DEFAULT_KOL_SCORE_FORMULA_ID = 'default';

export const KOL_SCORE_FORMULA_IDS: ReadonlyArray<string> = Object.freeze(
  Object.keys(KOL_SCORE_FORMULAS),
);

export const KOL_SCORE_FORMULA_OPTIONS: ReadonlyArray<KolScoreFormula> =
  Object.freeze(KOL_SCORE_FORMULA_IDS.map((id) => KOL_SCORE_FORMULAS[id]!));