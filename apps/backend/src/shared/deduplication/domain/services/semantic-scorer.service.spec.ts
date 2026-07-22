/**
 * Tests for semantic-scorer.service.ts
 *
 * NO NestJS decorators, NO TypeORM, NO IO.
 */

import {
  cosineSimilarity,
  minMaxScale,
  SemanticScorer,
} from './semantic-scorer.service';

describe('cosineSimilarity', () => {
  describe('basic vector operations', () => {
    it('should return 1.0 for identical vectors', () => {
      expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1.0);
      expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1.0);
      expect(cosineSimilarity([0.5, 0.5], [0.5, 0.5])).toBeCloseTo(1.0);
    });

    it('should return 0.0 for orthogonal vectors', () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBe(0.0);
      expect(cosineSimilarity([1, 2], [-2, 1])).toBe(0.0);
    });

    it('should return -1.0 for opposite vectors', () => {
      expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
      expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1.0);
    });

    it('should handle 3D vectors correctly', () => {
      const result = cosineSimilarity([1, 2, 3], [4, 5, 6]);
      // (1*4 + 2*5 + 3*6) / (sqrt(14) * sqrt(77))
      // = 32 / (3.741657 * 8.774964) = 32 / 32.82 ≈ 0.975
      expect(result).toBeCloseTo(0.975, 2);
    });

    it('should return 0 for zero vectors', () => {
      expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
      expect(cosineSimilarity([1, 0], [0, 0])).toBe(0);
      expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
    });

    it('should handle vectors with negative values', () => {
      expect(cosineSimilarity([-1, -2], [-1, -2])).toBeCloseTo(1.0);
      expect(cosineSimilarity([-1, 0], [1, 0])).toBeCloseTo(-1.0);
    });
  });

  describe('error handling', () => {
    it('should throw Error for empty vectors', () => {
      expect(() => cosineSimilarity([], [])).toThrow(
        'Cannot compute similarity for empty vectors',
      );
    });

    it('should throw Error for dimension mismatch', () => {
      expect(() => cosineSimilarity([1], [1, 2])).toThrow(
        'Vector dimension mismatch: 1 vs 2',
      );
      expect(() => cosineSimilarity([1, 2, 3], [1, 2])).toThrow(
        'Vector dimension mismatch: 3 vs 2',
      );
    });
  });
});

describe('minMaxScale', () => {
  describe('normal cases', () => {
    it('should scale values to [0, 1] range', () => {
      expect(minMaxScale([1, 2, 3, 4, 5])).toEqual([0, 0.25, 0.5, 0.75, 1]);
    });

    it('should handle unsorted input', () => {
      expect(minMaxScale([5, 1, 3, 2, 4])).toEqual([1, 0, 0.5, 0.25, 0.75]);
    });

    it('should handle two values', () => {
      expect(minMaxScale([10, 20])).toEqual([0, 1]);
      expect(minMaxScale([20, 10])).toEqual([1, 0]);
    });

    it('should handle negative values', () => {
      expect(minMaxScale([-5, 0, 5])).toEqual([0, 0.5, 1]);
    });

    it('should handle decimal values', () => {
      expect(minMaxScale([0.1, 0.5, 0.9])).toEqual([0, 0.5, 1]);
    });
  });

  describe('edge cases', () => {
    it('should return array of 0.5 when all values are equal', () => {
      expect(minMaxScale([5, 5, 5])).toEqual([0.5, 0.5, 0.5]);
      expect(minMaxScale([100])).toEqual([0.5]);
    });

    it('should return empty array for empty input', () => {
      expect(minMaxScale([])).toEqual([]);
    });

    it('should handle single value', () => {
      expect(minMaxScale([42])).toEqual([0.5]);
    });

    it('should handle all same values', () => {
      expect(minMaxScale([3, 3, 3, 3])).toEqual([0.5, 0.5, 0.5, 0.5]);
    });
  });
});

describe('SemanticScorer class', () => {
  describe('cosineSimilarity', () => {
    it('should return 1.0 for identical vectors', () => {
      expect(SemanticScorer.cosineSimilarity([1, 0], [1, 0])).toBe(1.0);
    });

    it('should return 0.0 for orthogonal vectors', () => {
      expect(SemanticScorer.cosineSimilarity([1, 0], [0, 1])).toBe(0.0);
    });

    it('should throw Error for empty vectors', () => {
      expect(() => SemanticScorer.cosineSimilarity([], [])).toThrow();
    });

    it('should throw Error for dimension mismatch', () => {
      expect(() => SemanticScorer.cosineSimilarity([1], [1, 2])).toThrow();
    });
  });

  describe('minMaxScale', () => {
    it('should scale values to [0, 1] range', () => {
      expect(SemanticScorer.minMaxScale([1, 2, 3])).toEqual([0, 0.5, 1]);
    });

    it('should return array of 0.5 when all values are equal', () => {
      expect(SemanticScorer.minMaxScale([5, 5, 5])).toEqual([0.5, 0.5, 0.5]);
    });
  });
});

describe('acceptance criteria', () => {
  it('cosineSimilarity([1,0], [1,0]) = 1.0', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1.0);
  });

  it('cosineSimilarity([1,0], [0,1]) = 0.0', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it('cosineSimilarity([], []) throws Error', () => {
    expect(() => cosineSimilarity([], [])).toThrow();
  });

  it('cosineSimilarity([1], [1,2]) throws Error', () => {
    expect(() => cosineSimilarity([1], [1, 2])).toThrow();
  });
});
