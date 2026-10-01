import { DedupScorerService } from './dedup-scorer.service';

describe('DedupScorerService', () => {
  const scorer = new DedupScorerService();

  it('marks near-identical content as duplicate', () => {
    const result = scorer.computeScore({
      semantic: 0.97,
      jaccard: 0.9,
      urlOverlap: 1,
      minutesApart: 5,
      numberJaccard: 1,
      entityJaccard: 1,
      cashtagJaccard: 1,
    });
    expect(result.zone).toBe('duplicate');
    expect(result.score).toBeGreaterThan(0.95);
  });

  it('marks unrelated content as different', () => {
    const result = scorer.computeScore({
      semantic: 0.2,
      jaccard: 0.05,
      urlOverlap: 0,
      minutesApart: 5000,
      numberJaccard: 0,
      entityJaccard: 0,
      cashtagJaccard: 0,
    });
    expect(result.zone).toBe('different');
  });

  it('lands paraphrases in the gray zone', () => {
    const result = scorer.computeScore({
      semantic: 0.72,
      jaccard: 0.4,
      urlOverlap: 0,
      minutesApart: 60,
      numberJaccard: 1,
      entityJaccard: 0.5,
      cashtagJaccard: 1,
    });
    expect(result.zone).toBe('gray_zone');
  });

  it('penalizes mismatched numbers', () => {
    const matched = scorer.computeScore({
      semantic: 0.9,
      jaccard: 0.6,
      urlOverlap: 0,
      minutesApart: 10,
      numberJaccard: 1,
      entityJaccard: 1,
      cashtagJaccard: 1,
      hasNumbers: true,
    });
    const mismatched = scorer.computeScore({
      semantic: 0.9,
      jaccard: 0.6,
      urlOverlap: 0,
      minutesApart: 10,
      numberJaccard: 0,
      entityJaccard: 1,
      cashtagJaccard: 1,
      hasNumbers: true,
    });
    expect(mismatched.score).toBeLessThan(matched.score);
  });

  it('computes jaccard similarities', () => {
    expect(scorer.jaccard(['a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3);
    expect(scorer.jaccard([], [])).toBe(1);
  });
});
