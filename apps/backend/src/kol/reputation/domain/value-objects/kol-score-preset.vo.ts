import {
  KOL_SCORE_FORMULAS,
  DEFAULT_KOL_SCORE_FORMULA_ID,
  type KolScoreFormula,
} from 'kol/reputation/domain/value-objects/kol-score-formula.vo';

/**
 * KolScorePreset — the unified operator-tunable value set for
 * kol/reputation scoring.
 *
 * Wraps a `KolScoreFormula` (the weight set) and adds the rest of
 * the operator knobs that were previously hardcoded:
 *
 *   - outcome bucket thresholds (X2 / X5 / X10 / X50 / rug50 / rug80)
 *   - whitelist multipliers (KNOWN_GOOD, KNOWN_BAD)
 *   - confidence thresholds (low / medium / high)
 *   - knownGoodScore (replaces the hardcoded 0.9)
 *
 * Lives in `settings_presets.snapshot` (jsonb) — one row per preset.
 * See `.omo/drafts/configurable-presets.md` for the full design.
 *
 * Slice A ships this as a typed read path with hardcoded defaults.
 * Slice B wires per-KOL/per-chain/per-token scopes.
 */
export interface KolScorePreset {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly formula: KolScoreFormula;

  /** Multiplier thresholds for the outcome buckets. */
  readonly outcomeBuckets: {
    /** Multiplier for the X2 bucket (default 2). */
    readonly x2: number;
    /** Multiplier for the X5 bucket (default 5). */
    readonly x5: number;
    /** Multiplier for the X10 bucket (default 10). */
    readonly x10: number;
    /** Multiplier for the X50 bucket (default 50). */
    readonly x50: number;
    /** Max multiple to qualify as a 50% drawdown (default 0.5). */
    readonly rug50: number;
    /** Max multiple to qualify as an 80% drawdown (default 0.2). */
    readonly rug80: number;
  };

  /** Multipliers applied to the blended score. */
  readonly whitelistMultipliers: {
    /** Multiplier when KOL is on the KNOWN_GOOD list (default 1.2). */
    readonly knownGood: number;
    /** Multiplier when KOL is on the KNOWN_BAD list (default 0.5). */
    readonly knownBad: number;
  };

  /** Total-mentions cutoffs for confidence tiers. */
  readonly confidenceThresholds: {
    /** < this → LOW (default 5). */
    readonly low: number;
    /** < this → MEDIUM (default 20). */
    readonly medium: number;
    /** < this → HIGH (default 50). */
    readonly high: number;
    /** ≥ this → VERY_HIGH. */
  };

  /** Score returned by `KnownKolPort.getGoodScore` (default 0.9). */
  readonly knownGoodScore: number;
}

/**
 * The hardcoded default preset — matches the values that were in
 * the code before Slice A. Used as the fallback when no row exists
 * in `settings_presets` for the active scope.
 */
export const DEFAULT_KOL_SCORE_PRESET: KolScorePreset = Object.freeze({
  id: 'default',
  name: 'Default',
  description:
    'Hardcoded fallback — used when settings_presets has no active row. Mirrors the pre-Slice A values.',
  formula: KOL_SCORE_FORMULAS[DEFAULT_KOL_SCORE_FORMULA_ID],
  outcomeBuckets: Object.freeze({
    x2: 2,
    x5: 5,
    x10: 10,
    x50: 50,
    rug50: 0.5,
    rug80: 0.2,
  }),
  whitelistMultipliers: Object.freeze({
    knownGood: 1.2,
    knownBad: 0.5,
  }),
  confidenceThresholds: Object.freeze({
    low: 5,
    medium: 20,
    high: 50,
  }),
  knownGoodScore: 0.9,
});

export class InvalidKolScorePreset extends Error {
  constructor(public readonly reason: string) {
    super(`Invalid KolScorePreset: ${reason}`);
  }
}

/**
 * Construct a `KolScorePreset` from a partial JSON snapshot. Validates:
 *   - outcome thresholds are positive
 *   - rug thresholds are between 0 and 1
 *   - multipliers are non-negative
 *   - confidence thresholds are increasing
 *
 * Missing fields fall back to `DEFAULT_KOL_SCORE_PRESET`.
 */
export function buildKolScorePreset(
  id: string,
  name: string,
  description: string,
  partial: Partial<
    Omit<KolScorePreset, 'id' | 'name' | 'description' | 'formula'>
  > & {
    formulaId?: string;
  },
): KolScorePreset {
  const formula =
    KOL_SCORE_FORMULAS[partial.formulaId ?? DEFAULT_KOL_SCORE_FORMULA_ID] ??
    KOL_SCORE_FORMULAS[DEFAULT_KOL_SCORE_FORMULA_ID];

  const outcomeBuckets = {
    x2:
      partial.outcomeBuckets?.x2 ?? DEFAULT_KOL_SCORE_PRESET.outcomeBuckets.x2,
    x5:
      partial.outcomeBuckets?.x5 ?? DEFAULT_KOL_SCORE_PRESET.outcomeBuckets.x5,
    x10:
      partial.outcomeBuckets?.x10 ??
      DEFAULT_KOL_SCORE_PRESET.outcomeBuckets.x10,
    x50:
      partial.outcomeBuckets?.x50 ??
      DEFAULT_KOL_SCORE_PRESET.outcomeBuckets.x50,
    rug50:
      partial.outcomeBuckets?.rug50 ??
      DEFAULT_KOL_SCORE_PRESET.outcomeBuckets.rug50,
    rug80:
      partial.outcomeBuckets?.rug80 ??
      DEFAULT_KOL_SCORE_PRESET.outcomeBuckets.rug80,
  };
  if (outcomeBuckets.x2 <= 1) {
    throw new InvalidKolScorePreset('x2 must be > 1');
  }
  if (
    outcomeBuckets.x2 >= outcomeBuckets.x5 ||
    outcomeBuckets.x5 >= outcomeBuckets.x10 ||
    outcomeBuckets.x10 >= outcomeBuckets.x50
  ) {
    throw new InvalidKolScorePreset(
      'outcome thresholds must be strictly increasing: x2 < x5 < x10 < x50',
    );
  }
  if (outcomeBuckets.rug50 <= 0 || outcomeBuckets.rug50 >= 1) {
    throw new InvalidKolScorePreset('rug50 must be in (0, 1)');
  }
  if (
    outcomeBuckets.rug80 <= 0 ||
    outcomeBuckets.rug80 >= outcomeBuckets.rug50
  ) {
    throw new InvalidKolScorePreset('rug80 must be in (0, rug50)');
  }

  const whitelistMultipliers = {
    knownGood:
      partial.whitelistMultipliers?.knownGood ??
      DEFAULT_KOL_SCORE_PRESET.whitelistMultipliers.knownGood,
    knownBad:
      partial.whitelistMultipliers?.knownBad ??
      DEFAULT_KOL_SCORE_PRESET.whitelistMultipliers.knownBad,
  };
  if (whitelistMultipliers.knownGood < 0 || whitelistMultipliers.knownBad < 0) {
    throw new InvalidKolScorePreset(
      'whitelist multipliers must be non-negative',
    );
  }

  const confidenceThresholds = {
    low:
      partial.confidenceThresholds?.low ??
      DEFAULT_KOL_SCORE_PRESET.confidenceThresholds.low,
    medium:
      partial.confidenceThresholds?.medium ??
      DEFAULT_KOL_SCORE_PRESET.confidenceThresholds.medium,
    high:
      partial.confidenceThresholds?.high ??
      DEFAULT_KOL_SCORE_PRESET.confidenceThresholds.high,
  };
  if (
    confidenceThresholds.low <= 0 ||
    confidenceThresholds.low >= confidenceThresholds.medium ||
    confidenceThresholds.medium >= confidenceThresholds.high
  ) {
    throw new InvalidKolScorePreset(
      'confidence thresholds must be strictly increasing: low < medium < high',
    );
  }

  const knownGoodScore =
    partial.knownGoodScore ?? DEFAULT_KOL_SCORE_PRESET.knownGoodScore;
  if (knownGoodScore < 0 || knownGoodScore > 1) {
    throw new InvalidKolScorePreset('knownGoodScore must be in [0, 1]');
  }

  return Object.freeze({
    id,
    name,
    description,
    formula,
    outcomeBuckets: Object.freeze(outcomeBuckets),
    whitelistMultipliers: Object.freeze(whitelistMultipliers),
    confidenceThresholds: Object.freeze(confidenceThresholds),
    knownGoodScore,
  });
}
