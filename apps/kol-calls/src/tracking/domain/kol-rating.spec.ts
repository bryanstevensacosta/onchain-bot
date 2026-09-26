import {
  classifyMultiple,
  outcomeWeight,
  rateKol,
} from './kol-rating';

describe('kol-rating (todo 12, failing-first, backend outcome mirror)', () => {
  it('reuses the backend STRONG>=5x outcome pattern', () => {
    expect(classifyMultiple(5)).toBe('STRONG');
    expect(classifyMultiple(10.5)).toBe('STRONG');
    expect(classifyMultiple(2)).toBe('GOOD');
    expect(classifyMultiple(3)).toBe('GOOD');
    expect(classifyMultiple(1)).toBe('NEUTRAL');
    expect(classifyMultiple(0.5)).toBe('NEUTRAL');
    expect(classifyMultiple(0.2)).toBe('POOR');
    expect(classifyMultiple(null)).toBe('NEUTRAL');
  });

  it('weights outcomes like the backend Outcome VO', () => {
    expect(outcomeWeight('STRONG')).toBe(1);
    expect(outcomeWeight('GOOD')).toBe(0.5);
    expect(outcomeWeight('NEUTRAL')).toBe(0);
    expect(outcomeWeight('POOR')).toBe(-0.3);
    expect(outcomeWeight('FAILED')).toBe(-0.8);
  });

  it('rates a kol from its call multiples (documented example: 0.3)', () => {
    // 10x STRONG (1) + 3x GOOD (0.5) + 1x NEUTRAL (0) + 0.2x POOR (-0.3)
    // score = (1 + 0.5 + 0 - 0.3) / 4 = 0.3
    const rating = rateKol([10, 3, 1, 0.2]);
    expect(rating.total).toBe(4);
    expect(rating.strong).toBe(1);
    expect(rating.good).toBe(1);
    expect(rating.neutral).toBe(1);
    expect(rating.poor).toBe(1);
    expect(rating.score).toBeCloseTo(0.3, 10);
  });

  it('counts null multiples as neutral (no-data, never failed)', () => {
    const rating = rateKol([null, 6]);
    expect(rating.total).toBe(2);
    expect(rating.neutral).toBe(1);
    expect(rating.strong).toBe(1);
    expect(rating.score).toBeCloseTo(0.5, 10);
  });

  it('rates an empty history as zero', () => {
    const rating = rateKol([]);
    expect(rating.total).toBe(0);
    expect(rating.score).toBe(0);
  });
});
