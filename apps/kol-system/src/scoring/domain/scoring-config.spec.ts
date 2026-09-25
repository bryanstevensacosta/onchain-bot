import { DomainError } from '../../shared/kernel/domain-error';
import {
  DEFAULT_SCORING_CONFIG,
  mergeScoringConfig,
  resolveScoringConfig,
  validateScoringConfig,
} from './scoring-config';

describe('scoring-config (todo 22, P28)', () => {
  it('defaults equal the v1 formula (compat baseline)', () => {
    expect(DEFAULT_SCORING_CONFIG.baseScore).toBe(50);
    expect(DEFAULT_SCORING_CONFIG.bonuses.liquidityHigh).toBe(20);
    expect(DEFAULT_SCORING_CONFIG.bonuses.holdersHigh).toBe(15);
    expect(DEFAULT_SCORING_CONFIG.bonuses.mcHigh).toBe(10);
    expect(DEFAULT_SCORING_CONFIG.bonuses.volumeHigh).toBe(5);
    expect(DEFAULT_SCORING_CONFIG.signalPenalties).toEqual({
      CRITICAL: 15,
      HIGH: 8,
      MEDIUM: 4,
      LOW: 1,
    });
    expect(DEFAULT_SCORING_CONFIG.securityCaps).toEqual({
      SCAM: 5,
      SUSPICIOUS: 30,
      UNKNOWN: 20,
      LEGITIMATE: 100,
    });
    expect(DEFAULT_SCORING_CONFIG.multiplierPivot).toBe(0.5);
    expect(DEFAULT_SCORING_CONFIG.multiplierSlope).toBe(0.3);
    expect(DEFAULT_SCORING_CONFIG.tiers).toEqual({
      strong: 80,
      decent: 60,
      neutral: 40,
      risky: 20,
    });
    expect(DEFAULT_SCORING_CONFIG.gates.minScore).toBe(50);
    expect(DEFAULT_SCORING_CONFIG.gates.publishableChains).toEqual([
      'evm',
      'solana',
    ]);
  });

  it('defaults pass validation', () => {
    expect(() => validateScoringConfig(DEFAULT_SCORING_CONFIG)).not.toThrow();
  });

  it('resolve merges a partial patch over defaults without touching them', () => {
    const resolved = resolveScoringConfig({
      baseScore: 10,
      gates: { minScore: 0 },
    });
    expect(resolved.baseScore).toBe(10);
    expect(resolved.gates.minScore).toBe(0);
    expect(resolved.bonuses.liquidityHigh).toBe(20);
    expect(resolved.tiers.strong).toBe(80);
    expect(DEFAULT_SCORING_CONFIG.baseScore).toBe(50);
    expect(DEFAULT_SCORING_CONFIG.gates.minScore).toBe(50);
  });

  it('merge over a custom base preserves prior customs (PATCH semantics)', () => {
    const base = resolveScoringConfig({ baseScore: 10 });
    const merged = mergeScoringConfig(base, { gates: { minScore: 0 } });
    expect(merged.baseScore).toBe(10);
    expect(merged.gates.minScore).toBe(0);
  });

  it('ignores explicit undefined keys (class-transformer DTO instances)', () => {
    const merged = resolveScoringConfig({
      baseScore: 10,
      gates: { minScore: 0, maxRiskWeight: undefined },
    });
    expect(merged.baseScore).toBe(10);
    expect(merged.gates.minScore).toBe(0);
    expect(merged.gates.maxRiskWeight).toBe(100);
    expect(() => validateScoringConfig(merged)).not.toThrow();
  });

  it.each([
    ['baseScore over 100', { baseScore: 101 }],
    ['negative baseScore', { baseScore: -1 }],
    ['penalty over 100', { signalPenalties: { CRITICAL: 101 } }],
    ['cap over 100', { securityCaps: { SCAM: 101 } }],
    ['pivot over 1', { multiplierPivot: 1.5 }],
    [
      'unordered tiers',
      { tiers: { strong: 10, decent: 60, neutral: 40, risky: 20 } },
    ],
    ['minScore over 100', { gates: { minScore: 101 } }],
    ['minCompleteness over 1', { gates: { minCompleteness: 2 } }],
    ['inverted ladder', { bonuses: { liquidityThresholdHigh: 1 } }],
  ])('rejects %s', (_label, patch) => {
    const merged = resolveScoringConfig(patch);
    expect(() => validateScoringConfig(merged)).toThrow(DomainError);
  });

  it('rejects non-objects and wrong shapes', () => {
    expect(() => validateScoringConfig(null)).toThrow(DomainError);
    expect(() => validateScoringConfig({ baseScore: 50 })).toThrow(DomainError);
    expect(() =>
      validateScoringConfig({ ...DEFAULT_SCORING_CONFIG, tiers: null }),
    ).toThrow(DomainError);
  });
});
