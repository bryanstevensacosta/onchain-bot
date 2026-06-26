import {
  KOL_SCORE_FORMULAS,
  DEFAULT_KOL_SCORE_FORMULA_ID,
  defineKolScoreFormula,
  getKolScoreFormula,
  InvalidKolScoreFormula,
} from 'kol/reputation/domain/value-objects/kol-score-formula.vo';
import { KolReputationCalculator } from 'kol/reputation/domain/services/kol-reputation-calculator';

describe('KolScoreFormula presets', () => {
  it('has a default formula', () => {
    expect(KOL_SCORE_FORMULAS[DEFAULT_KOL_SCORE_FORMULA_ID]).toBeDefined();
    expect(KOL_SCORE_FORMULAS[DEFAULT_KOL_SCORE_FORMULA_ID]!.id).toBe('default');
  });

  it('ships 4 presets (default, mention-heavy, quality-heavy, balanced)', () => {
    expect(Object.keys(KOL_SCORE_FORMULAS).sort()).toEqual([
      'balanced',
      'default',
      'mention-heavy',
      'quality-heavy',
    ]);
  });

  it('every preset weights sum to 1.0', () => {
    for (const [id, f] of Object.entries(KOL_SCORE_FORMULAS)) {
      const sum = f.weights.mention + f.weights.quality + f.weights.drawdown;
      expect(Math.abs(sum - 1)).toBeLessThan(0.0001);
      expect(id).toBe(f.id);
    }
  });

  it('every preset has a non-empty name and description', () => {
    for (const f of Object.values(KOL_SCORE_FORMULAS)) {
      expect(f.name.length).toBeGreaterThan(0);
      expect(f.description.length).toBeGreaterThan(0);
    }
  });
});

describe('defineKolScoreFormula', () => {
  it('rejects weights that do not sum to 1.0', () => {
    expect(() =>
      defineKolScoreFormula('bad', 'Bad', 'x', {
        mention: 0.5,
        quality: 0.5,
        drawdown: 0.5,
      }),
    ).toThrow(InvalidKolScoreFormula);
  });

  it('rejects negative weights', () => {
    expect(() =>
      defineKolScoreFormula('bad', 'Bad', 'x', {
        mention: 1.5,
        quality: -0.5,
        drawdown: 0,
      }),
    ).toThrow(InvalidKolScoreFormula);
  });

  it('produces a frozen VO', () => {
    const f = defineKolScoreFormula('custom', 'Custom', 'x', {
      mention: 0.5,
      quality: 0.3,
      drawdown: 0.2,
    });
    expect(Object.isFrozen(f)).toBe(true);
  });
});

describe('getKolScoreFormula', () => {
  it('returns the formula for a known id', () => {
    const f = getKolScoreFormula('default');
    expect(f.id).toBe('default');
  });

  it('throws for an unknown id', () => {
    expect(() => getKolScoreFormula('nonexistent')).toThrow(
      InvalidKolScoreFormula,
    );
  });
});

describe('KolReputationCalculator with formula', () => {
  const calls = [
    {
      chain: 'solana',
      address: 'ABC',
      sources: [{ kolId: 'k1', mentionCount: 1 }],
      lastSeenAt: new Date('2026-06-26T00:00:00Z'),
    },
  ];

  it('produces the same score for the same input + default formula', () => {
    const a = KolReputationCalculator.calculateFromCanonicalCalls('k1', calls);
    const b = KolReputationCalculator.calculateFromCanonicalCalls(
      'k1',
      calls,
      'default',
    );
    expect(a.score).toBe(b.score);
  });

  it('produces different scores for different formulas (mention-heavy vs quality-heavy)', () => {
    const mentionHeavy = KolReputationCalculator.calculateFromCanonicalCalls(
      'k1',
      calls,
      'mention-heavy',
    );
    const qualityHeavy = KolReputationCalculator.calculateFromCanonicalCalls(
      'k1',
      calls,
      'quality-heavy',
    );
    expect(mentionHeavy.score).not.toBe(qualityHeavy.score);
  });

  it('falls back to default when an unknown formula id is passed', () => {
    const a = KolReputationCalculator.calculateFromCanonicalCalls(
      'k1',
      calls,
      'default',
    );
    const b = KolReputationCalculator.calculateFromCanonicalCalls(
      'k1',
      calls,
      'unknown-id',
    );
    expect(a.score).toBe(b.score);
  });

  it('blendScore with explicit formula matches inline weights', () => {
    const f = KOL_SCORE_FORMULAS['mention-heavy']!;
    const metrics = {
      mentionScore: 0.8,
      qualityScore: 0.6,
      drawdownScore: 0.7,
    };
    const expected =
      0.8 * f.weights.mention + 0.6 * f.weights.quality + 0.7 * f.weights.drawdown;
    const actual = KolReputationCalculator.blendScore(metrics, f);
    expect(actual).toBeCloseTo(expected, 6);
  });
});