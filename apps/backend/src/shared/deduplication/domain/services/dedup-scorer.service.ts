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
 * Computes Jaccard similarity between two number arrays with 1% tolerance.
 *
 * Two numbers match if |a - b| / max(a, b) < 0.01
 *
 * @param a - First array of numbers
 * @param b - Second array of numbers
 * @returns Jaccard similarity with tolerance
 *          Returns 1 if both are empty
 *          Returns 0 if only one is empty
 */
export function numberJaccardSimilarity(a: number[], b: number[]): number {
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
    return diffRatio < 0.01;
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
  const numberJaccard = numberJaccardSimilarity(input.numbersM, input.numbersE);
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

  // URL overlap boost
  const urlBoost = input.urlOverlapCount > 0 ? cfg.urlBoost : 0;
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

  // Proximity boost
  const proximityBoost =
    input.sameSource && input.timeDiffMinutes < cfg.proximityWindowMinutes
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

  // Clamp to [0, 1]
  score = Math.max(0, Math.min(1, score));

  // Determine zone
  let zone: 'duplicate' | 'different' | 'gray_zone';
  if (score > 0.95) {
    zone = 'duplicate';
  } else if (score < 0.75) {
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
