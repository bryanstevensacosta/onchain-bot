/**
 * F1 (Issue #3): `numberJaccardTolerance` must be a configurable parameter on
 * `ScoreConfig`, with the public signature of `numberJaccardSimilarity` left
 * unchanged so the existing 21-test suite in `dedup-scorer.service.spec.ts`
 * keeps passing.
 *
 * These tests pin the contract:
 *  1. The default `numberJaccardTolerance` is `0.01` (byte-identical to the
 *     pre-refactor hardcoded constant) — regression on `DEFAULT_CONFIG`.
 *  2. `numberJaccardSimilarity([2600], [2628])` returns `0` with the default
 *     tolerance (1.07% diff > 1%) — the legacy behavior is preserved.
 *  3. Passing `numberJaccardTolerance: 0.02` through `computeScore` lifts the
 *     Jaccard for `[2600]` vs `[2628]` (1.07% diff fits in 2%) past the
 *     `numberPenaltyMedium` threshold, removing the `number_penalty` signal
 *     entirely — the configurable knob actually works end-to-end.
 */

import {
  computeScore,
  numberJaccardSimilarity,
  DEFAULT_CONFIG,
  type ScoreInput,
} from './dedup-scorer.service';

const makeEmptyInput = (overrides?: Partial<ScoreInput>): ScoreInput => ({
  embeddingM: [1, 0],
  embeddingE: [1, 0],
  tokensM: [],
  tokensE: [],
  numbersM: [],
  numbersE: [],
  entitiesM: [],
  entitiesE: [],
  cashtagsM: [],
  cashtagsE: [],
  urlOverlapCount: 0,
  sameSource: false,
  timeDiffMinutes: 999,
  ...overrides,
});

describe('F1: numberJaccardTolerance configurability', () => {
  it('DEFAULT_CONFIG.numberJaccardTolerance is 0.01 (byte-identical to legacy hardcoded value)', () => {
    // The pre-refactor source hardcoded `0.01` directly in
    // `numberJaccardSimilarity`. The new default MUST match exactly so all
    // existing 88 dedup-scorer tests stay green without modification.
    expect(DEFAULT_CONFIG.numberJaccardTolerance).toBe(0.01);
  });

  it('public numberJaccardSimilarity([2600], [2628]) returns 0 with default tolerance (1.07% diff > 1%)', () => {
    // |2600 - 2628| / 2628 ≈ 0.01065 > 0.01 → no match → Jaccard 0.
    // This is the legacy behavior the 21 existing tests already pin.
    expect(numberJaccardSimilarity([2600], [2628])).toBe(0);
  });

  it('computeScore with { numberJaccardTolerance: 0.02 } lifts [2600] vs [2628] Jaccard past the number-penalty threshold', () => {
    // With tolerance 0.02, the 1.07% diff now matches → Jaccard = 1.0 →
    // number_penalty contribution collapses from `-numberPenaltyMedium` to 0.
    // We assert via the `number_penalty` signal, which is the public surface
    // `computeScore` exposes for downstream debugging.
    const result = computeScore(
      makeEmptyInput({ numbersM: [2600], numbersE: [2628] }),
      { numberJaccardTolerance: 0.02 },
    );
    const penaltySignal = result.signals.find(
      (s) => s.name === 'number_penalty',
    );
    expect(penaltySignal).toBeDefined();
    expect(penaltySignal!.contribution).toBeCloseTo(0);
  });

  it('computeScore with default tolerance still applies numberPenaltyMedium for [2600] vs [2628]', () => {
    // Sanity check: the override above is the one that changed behavior, not
    // the default. With `DEFAULT_CONFIG.numberJaccardTolerance = 0.01`, the
    // legacy penalty still fires — proving the new knob is opt-in.
    const result = computeScore(
      makeEmptyInput({ numbersM: [2600], numbersE: [2628] }),
    );
    const penaltySignal = result.signals.find(
      (s) => s.name === 'number_penalty',
    );
    expect(penaltySignal).toBeDefined();
    expect(penaltySignal!.contribution).toBe(
      -DEFAULT_CONFIG.numberPenaltyMedium,
    );
  });
});
