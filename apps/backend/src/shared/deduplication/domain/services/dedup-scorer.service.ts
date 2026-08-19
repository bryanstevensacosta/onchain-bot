/**
 * Pure domain service for computing deduplication similarity scores.
 *
 * NO NestJS decorators, NO TypeORM, NO IO.
 */

import { cosineSimilarity } from './semantic-scorer.service';

/**
 * Input interface for computing dedup score.
 */
export interface ScoreInput {
  embeddingM: number[];
  embeddingE: number[];
  tokensM: string[];
  tokensE: string[];
  numbersM: number[];
  numbersE: number[];
  entitiesM: string[];
  entitiesE: string[];
  cashtagsM: string[];
  cashtagsE: string[];
  urlOverlapCount: number;
  sameSource: boolean;
  timeDiffMinutes: number;
}

/**
 * Configuration interface for dedup scoring.
 */
export interface ScoreConfig {
  semanticThreshold: number;
  urlBoost: number;
  proximityBoost: number;
  proximityWindowMinutes: number;
  boostNumberJaccardThreshold: number;
  jaccardWeight: number;
  numberPenaltyLow: number;
  numberPenaltyMedium: number;
  entityPenaltyLow: number;
  entityPenaltyMedium: number;
  cashtagPenaltyLow: number;
  cashtagPenaltyMedium: number;
  templateDivergenceSemanticThreshold: number;
  templateDivergenceNumberJaccardThreshold: number;
  templateDivergencePenalty: number;
  urlDivergenceSemanticThreshold: number;
  urlDivergenceEntityJaccardThreshold: number;
  urlDivergenceNumberJaccardMin: number;
  urlDivergenceNumberJaccardMax: number;
  urlDivergencePenalty: number;
  grayZoneMin: number;
  duplicateThreshold: number;
  numberBoost: number;
  numberBoostMinSemantic: number;
  numberBoostMinMagnitude: number;
  numberBoostTolerance: number;
  numberJaccardTolerance: number;
}

/**
 * Output interface for computeScore.
 */
export interface ScoreOutput {
  score: number;
  zone: 'duplicate' | 'different' | 'gray_zone';
  signals: Array<{ name: string; contribution: number }>;
}

/**
 * Default configuration for dedup scoring.
 */
export const DEFAULT_CONFIG: ScoreConfig = {
  semanticThreshold: 0.85,
  urlBoost: 0.15,
  proximityBoost: 0.1,
  proximityWindowMinutes: 30,
  boostNumberJaccardThreshold: 0.7,
  jaccardWeight: 0.2,
  numberPenaltyLow: 0.05,
  numberPenaltyMedium: 0.15,
  entityPenaltyLow: 0.05,
  entityPenaltyMedium: 0.12,
  cashtagPenaltyLow: 0.08,
  cashtagPenaltyMedium: 0.15,
  templateDivergenceSemanticThreshold: 0.9,
  templateDivergenceNumberJaccardThreshold: 0.4,
  templateDivergencePenalty: 0.15,
  urlDivergenceSemanticThreshold: 0.9,
  urlDivergenceEntityJaccardThreshold: 0.5,
  urlDivergenceNumberJaccardMin: 0.3,
  urlDivergenceNumberJaccardMax: 0.9,
  urlDivergencePenalty: 0.12,
  grayZoneMin: 0.6,
  duplicateThreshold: 0.95,
  numberBoost: 0.12,
  numberBoostMinSemantic: 0.55,
  numberBoostMinMagnitude: 1e6,
  numberBoostTolerance: 0.01,
  numberJaccardTolerance: 0.01,
};

/**
 * Computes Jaccard similarity between two string arrays.
 *
 * @param a - First array of strings
 * @param b - Second array of strings
 * @returns Jaccard similarity (intersection / union)
 *          Returns 1 if both are empty
 *          Returns 0 if only one is empty
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) {
    return 1;
  }
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const setA = new Set(a);
  const setB = new Set(b);

  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;

  return intersection / union;
}

/**
 * Computes Jaccard similarity between two number arrays with a configurable
 * relative tolerance.
 *
 * Two numbers match if |a - b| / max(|a|, |b|) < `tolerance`. The default
 * tolerance is 0.01 (1%), exposed via `DEFAULT_CONFIG.numberJaccardTolerance`
 * and overridable through the `ScoreConfig` passed to `computeScore`.
 *
 * @param a - First array of numbers
 * @param b - Second array of numbers
 * @returns Jaccard similarity with tolerance
 *          Returns 1 if both are empty
 *          Returns 0 if only one is empty
 */
export function numberJaccardSimilarity(a: number[], b: number[]): number {
  return _numberJaccardWithTolerance(
    a,
    b,
    DEFAULT_CONFIG.numberJaccardTolerance,
  );
}

/**
 * Private helper for `numberJaccardSimilarity` that takes the tolerance
 * explicitly. Used by `computeScore` to honor a per-call `ScoreConfig`
 * override, and by tests to exercise configurable behavior.
 *
 * Not exported — keep `numberJaccardSimilarity(a, b)` as the public API.
 */
function _numberJaccardWithTolerance(
  a: number[],
  b: number[],
  tolerance: number,
): number {
  if (a.length === 0 && b.length === 0) {
    return 1;
  }
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const setA = new Set(a);
  const setB = new Set(b);

  const isWithinTolerance = (x: number, y: number): boolean => {
    const maxVal = Math.max(Math.abs(x), Math.abs(y));
    if (maxVal === 0) return x === y;
    const diffRatio = Math.abs(x - y) / maxVal;
    return diffRatio < tolerance;
  };

  // Count unique numbers in a that have a match in b
  const matchingInA = [...setA].filter((numA) =>
    [...setB].some((numB) => isWithinTolerance(numA, numB)),
  );

  // Count unique numbers in b that have a match in a
  const matchingInB = [...setB].filter((numB) =>
    [...setA].some((numA) => isWithinTolerance(numA, numB)),
  );

  // Intersection is the set of unique matching numbers
  const intersection = new Set([...matchingInA, ...matchingInB]);
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

/**
 * Checks whether two number arrays share at least one "distinctive" number —
 * a number with |value| >= minMagnitude and a partner within `tolerance`
 * (relative difference). Used by the number-boost signal to gate the boost
 * on shared large values (e.g., $5B, $50B) rather than small or coincidental
 * matches (dates, percentages, ids).
 *
 * @param a - First array of numbers
 * @param b - Second array of numbers
 * @param minMagnitude - Minimum |value| to qualify as "distinctive"
 * @param tolerance - Max relative difference |a-b|/max(|a|,|b|) to count as a match
 * @returns true if a pair (x in a, y in b) passes both checks
 */
export function hasSharedDistinctiveNumber(
  a: number[],
  b: number[],
  minMagnitude: number,
  tolerance: number,
): boolean {
  const isWithin = (x: number, y: number): boolean => {
    const maxVal = Math.max(Math.abs(x), Math.abs(y));
    if (maxVal === 0) return x === y;
    return Math.abs(x - y) / maxVal < tolerance;
  };
  for (const x of a) {
    if (Math.abs(x) < minMagnitude) continue;
    for (const y of b) {
      if (Math.abs(y) < minMagnitude) continue;
      if (isWithin(x, y)) return true;
    }
  }
  return false;
}

/**
 * Computes Jaccard similarity between two entity arrays (exact string match).
 *
 * @param a - First array of entities
 * @param b - Second array of entities
 * @returns Jaccard similarity (intersection / union)
 *          Returns 1 if both are empty
 *          Returns 0 if only one is empty
 */
export function entityJaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) {
    return 1;
  }
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const setA = new Set(a);
  const setB = new Set(b);

  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;

  return intersection / union;
}

/**
 * Computes Jaccard similarity between two cashtag arrays (exact string match).
 *
 * @param a - First array of cashtags
 * @param b - Second array of cashtags
 * @returns Jaccard similarity (intersection / union)
 *          Returns 1 if both are empty
 *          Returns 0 if only one is empty
 */
export function cashtagJaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) {
    return 1;
  }
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  const setA = new Set(a);
  const setB = new Set(b);

  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;

  return intersection / union;
}

/**
 * Computes the deduplication score between two items.
 *
 * @param input - ScoreInput with all required fields
 * @param config - Optional partial config to override defaults
 * @returns Score output with score, zone, and signal contributions
 */
export function computeScore(
  input: ScoreInput,
  config?: Partial<ScoreConfig>,
): ScoreOutput {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const signals: Array<{ name: string; contribution: number }> = [];

  // Semantic similarity
  const semantic = cosineSimilarity(input.embeddingM, input.embeddingE);
  signals.push({ name: 'semantic', contribution: semantic });

  // Jaccard similarity
  const jaccard = jaccardSimilarity(input.tokensM, input.tokensE);
  const jaccardContribution = (jaccard - 0.3) * cfg.jaccardWeight;
  signals.push({ name: 'jaccard', contribution: jaccardContribution });

  // Number similarity with penalty
  const numberJaccard = _numberJaccardWithTolerance(
    input.numbersM,
    input.numbersE,
    cfg.numberJaccardTolerance,
  );
  let numberPenalty = 0;
  if (numberJaccard < 0.3) {
    numberPenalty = cfg.numberPenaltyMedium;
  } else if (numberJaccard < 0.6) {
    numberPenalty = cfg.numberPenaltyLow;
  }
  signals.push({ name: 'number_penalty', contribution: -numberPenalty });

  // Entity similarity with penalty
  const entityJaccard = entityJaccardSimilarity(
    input.entitiesM,
    input.entitiesE,
  );
  let entityPenalty = 0;
  if (entityJaccard < 0.1) {
    entityPenalty = cfg.entityPenaltyMedium;
  } else if (entityJaccard < 0.4) {
    entityPenalty = cfg.entityPenaltyLow;
  }
  signals.push({ name: 'entity_penalty', contribution: -entityPenalty });

  // Cashtag similarity with penalty
  const cashtagJaccard = cashtagJaccardSimilarity(
    input.cashtagsM,
    input.cashtagsE,
  );
  let cashtagPenalty = 0;
  if (cashtagJaccard < 0.1) {
    cashtagPenalty = cfg.cashtagPenaltyMedium;
  } else if (cashtagJaccard < 0.4) {
    cashtagPenalty = cfg.cashtagPenaltyLow;
  }
  signals.push({ name: 'cashtag_penalty', contribution: -cashtagPenalty });

  // Template divergence penalty: high semantic + low number similarity = likely an update
  const templateDivergencePenalty =
    semantic > cfg.templateDivergenceSemanticThreshold &&
    numberJaccard < cfg.templateDivergenceNumberJaccardThreshold
      ? cfg.templateDivergencePenalty
      : 0;
  signals.push({
    name: 'template_divergence_penalty',
    contribution: -templateDivergencePenalty,
  });

  // URL overlap boost — gated on numberJaccard >= boostNumberJaccardThreshold so
  // pairs that share a URL but have diverged numbers (e.g., UPDATE messages that
  // re-share the project link with new metrics) don't get cross-boosted past
  // the duplicate threshold.
  const urlBoost =
    input.urlOverlapCount > 0 &&
    numberJaccard >= cfg.boostNumberJaccardThreshold
      ? cfg.urlBoost
      : 0;
  signals.push({ name: 'url_boost', contribution: urlBoost });

  // URL divergence flag: high semantic + no URL overlap + same entities +
  // partial number update → may be an update from same source.
  // Signal is informational; zone-override below handles the actual decision.
  const urlDivergenceActive =
    semantic > cfg.urlDivergenceSemanticThreshold &&
    input.urlOverlapCount === 0 &&
    entityJaccard > cfg.urlDivergenceEntityJaccardThreshold &&
    numberJaccard > cfg.urlDivergenceNumberJaccardMin &&
    numberJaccard < cfg.urlDivergenceNumberJaccardMax;
  signals.push({
    name: 'url_divergence_penalty',
    contribution: 0,
  });

  // Proximity boost — same window condition AND numberJaccard gate; rationale
  // mirrors the urlBoost gate (UPDATE pairs from the same source arrive minutes
  // apart with diverged numbers; allowing the proximity bonus in that case
  // would push the score back into 'duplicate' territory).
  const proximityBoost =
    input.sameSource &&
    input.timeDiffMinutes < cfg.proximityWindowMinutes &&
    numberJaccard >= cfg.boostNumberJaccardThreshold
      ? cfg.proximityBoost
      : 0;
  signals.push({ name: 'proximity_boost', contribution: proximityBoost });

  // Compute final score
  let score =
    semantic +
    jaccardContribution +
    urlBoost +
    proximityBoost -
    numberPenalty -
    entityPenalty -
    cashtagPenalty -
    templateDivergencePenalty;

  // Distinctive-number boost: if both sides share a "large" number (>= minMagnitude,
  // within tolerance) and the semantic similarity clears the bar, lift the score.
  // This rescues pairs that diverge in wording but match on a salient figure
  // (e.g., "$5B raise", "$50B AI investment"). Gated on numberJaccard so the boost
  // only fires for numerically close pairs — purely semantic pairs do not get it.
  const numberBoost =
    cfg.numberBoost > 0 &&
    numberJaccard >= cfg.boostNumberJaccardThreshold &&
    hasSharedDistinctiveNumber(
      input.numbersM,
      input.numbersE,
      cfg.numberBoostMinMagnitude,
      cfg.numberBoostTolerance,
    ) &&
    semantic >= cfg.numberBoostMinSemantic
      ? cfg.numberBoost
      : 0;
  signals.push({ name: 'number_boost', contribution: numberBoost });
  score += numberBoost;

  // Clamp to [0, 1]
  score = Math.max(0, Math.min(1, score));

  // Determine zone
  let zone: 'duplicate' | 'different' | 'gray_zone';
  if (score > cfg.duplicateThreshold) {
    zone = 'duplicate';
  } else if (score < cfg.grayZoneMin) {
    zone = 'different';
  } else {
    zone = 'gray_zone';
  }

  // URL divergence override: force gray zone so the LLM arbiter decides
  // whether it's a duplicate or an update from the same source.
  if (urlDivergenceActive && zone === 'duplicate') {
    score = 0.88;
    zone = 'gray_zone';
  }

  return { score, zone, signals };
}

/**
 * Static class wrapping deduplication scoring functions.
 */
export class DedupScorer {
  /**
   * Computes Jaccard similarity between two string arrays.
   * @see jaccardSimilarity
   */
  public static jaccardSimilarity(a: string[], b: string[]): number {
    return jaccardSimilarity(a, b);
  }

  /**
   * Computes Jaccard similarity between two number arrays with 1% tolerance.
   * @see numberJaccardSimilarity
   */
  public static numberJaccardSimilarity(a: number[], b: number[]): number {
    return numberJaccardSimilarity(a, b);
  }

  /**
   * Computes Jaccard similarity between two entity arrays.
   * @see entityJaccardSimilarity
   */
  public static entityJaccardSimilarity(a: string[], b: string[]): number {
    return entityJaccardSimilarity(a, b);
  }

  /**
   * Computes Jaccard similarity between two cashtag arrays.
   * @see cashtagJaccardSimilarity
   */
  public static cashtagJaccardSimilarity(a: string[], b: string[]): number {
    return cashtagJaccardSimilarity(a, b);
  }

  /**
   * Computes the deduplication score between two items.
   * @see computeScore
   */
  public static computeScore(
    input: ScoreInput,
    config?: Partial<ScoreConfig>,
  ): ScoreOutput {
    return computeScore(input, config);
  }
}
