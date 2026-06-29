import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KOL_SCORE_FORMULA_ID,
  KOL_SCORE_FORMULAS,
  KOL_SCORE_FORMULA_IDS,
  KOL_SCORE_FORMULA_OPTIONS,
  type KolScoreFormula,
} from '@/entities/kol-reputation/model/kol-score-formula';

describe('KOL_SCORE_FORMULAS', () => {
  it('has a default formula', () => {
    expect(KOL_SCORE_FORMULAS[DEFAULT_KOL_SCORE_FORMULA_ID]).toBeDefined();
    expect(KOL_SCORE_FORMULAS[DEFAULT_KOL_SCORE_FORMULA_ID]!.id).toBe(
      'default',
    );
  });

  it('ships 4 presets (default, mention-heavy, quality-heavy, balanced)', () => {
    expect([...KOL_SCORE_FORMULA_IDS].sort()).toEqual([
      'balanced',
      'default',
      'mention-heavy',
      'quality-heavy',
    ]);
  });

  it('every preset weights sum to 1.0', () => {
    for (const f of Object.values(KOL_SCORE_FORMULAS) as KolScoreFormula[]) {
      const sum = f.weights.mention + f.weights.quality + f.weights.drawdown;
      expect(Math.abs(sum - 1)).toBeLessThan(0.0001);
    }
  });

  it('KOL_SCORE_FORMULA_OPTIONS has one entry per id, in deterministic order', () => {
    expect(KOL_SCORE_FORMULA_OPTIONS.length).toBe(KOL_SCORE_FORMULA_IDS.length);
    for (let i = 0; i < KOL_SCORE_FORMULA_OPTIONS.length; i++) {
      expect(KOL_SCORE_FORMULA_OPTIONS[i]!.id).toBe(KOL_SCORE_FORMULA_IDS[i]);
    }
  });
});
