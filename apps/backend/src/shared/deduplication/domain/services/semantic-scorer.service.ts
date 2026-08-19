/**
 * Pure domain service for computing semantic similarity scores.
 *
 * NO NestJS decorators, NO TypeORM, NO IO.
 */

/**
 * Computes cosine similarity between two vectors.
 *
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity score between -1 and 1 (0 for zero vectors)
 * @throws Error if dimensions don't match
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  if (a.length === 0) {
    throw new Error('Cannot compute similarity for empty vectors');
  }

  const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));

  // Handle zero vectors
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Normalizes an array of scores to [0, 1] range using min-max scaling.
 *
 * @param scores - Array of scores to normalize
 * @returns Normalized array where all values are in [0, 1] range
 *          If all values are equal, returns array of 0.5
 */
export function minMaxScale(scores: number[]): number[] {
  if (scores.length === 0) {
    return [];
  }

  const min = Math.min(...scores);
  const max = Math.max(...scores);

  // If all values are equal, return 0.5 for all
  if (min === max) {
    return scores.map(() => 0.5);
  }

  return scores.map((score) => (score - min) / (max - min));
}

/**
 * Static class wrapping semantic scoring functions.
 */
export class SemanticScorer {
  /**
   * Computes cosine similarity between two vectors.
   * @see cosineSimilarity
   */
  public static cosineSimilarity(a: number[], b: number[]): number {
    return cosineSimilarity(a, b);
  }

  /**
   * Normalizes scores to [0, 1] range using min-max scaling.
   * @see minMaxScale
   */
  public static minMaxScale(scores: number[]): number[] {
    return minMaxScale(scores);
  }
}
