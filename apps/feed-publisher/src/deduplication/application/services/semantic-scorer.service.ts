import { Injectable } from '@nestjs/common';

/**
 * Cosine scorer for embedding vectors (moved from backend
 * shared/deduplication semantic-scorer, todo 4). Pure math: 0 on empty,
 * zero, or mismatched inputs (fail-open downstream).
 */
@Injectable()
export class SemanticScorerService {
  public cosineSimilarity(
    a: ReadonlyArray<number>,
    b: ReadonlyArray<number>,
  ): number {
    const length = Math.min(a.length, b.length);
    if (length === 0) {
      return 0;
    }
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) {
      return 0;
    }
    const similarity = dot / (Math.sqrt(normA) * Math.sqrt(normB));
    return Math.max(-1, Math.min(1, similarity));
  }
}
