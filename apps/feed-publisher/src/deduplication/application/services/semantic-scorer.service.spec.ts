import { SemanticScorerService } from './semantic-scorer.service';

describe('SemanticScorerService', () => {
  const scorer = new SemanticScorerService();

  it('scores identical vectors at 1', () => {
    expect(scorer.cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
  });

  it('scores orthogonal vectors at 0', () => {
    expect(scorer.cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns 0 for empty or zero vectors', () => {
    expect(scorer.cosineSimilarity([], [])).toBe(0);
    expect(scorer.cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it('truncates to the shorter vector', () => {
    expect(scorer.cosineSimilarity([1, 0, 5], [1, 0])).toBeCloseTo(1);
  });
});
