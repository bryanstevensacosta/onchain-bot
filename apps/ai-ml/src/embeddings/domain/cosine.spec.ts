import { cosineSimilarity } from './cosine';

describe('cosineSimilarity (ai-ml todo 2, failing-first)', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('returns 0 when either vector has zero norm (never NaN)', () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
    expect(cosineSimilarity([1, 0], [0, 0])).toBe(0);
  });

  it('throws an explicit error on length mismatch', () => {
    expect(() => cosineSimilarity([1, 0], [1])).toThrow(
      'cosineSimilarity: vector length mismatch',
    );
  });
});
