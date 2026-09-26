import { DomainError } from '../../../shared/kernel/domain-error';
import { DEFAULT_SCORING_CONFIG } from '../../../scoring/domain/scoring-config';
import { PublishingTemplate } from './publishing-template.entity';

describe('PublishingTemplate scoring_config (todo 22, P28)', () => {
  it('defaults to the v1 scoring config on create', () => {
    const template = PublishingTemplate.create({ name: 't' });
    expect(template.scoringConfig).toEqual(DEFAULT_SCORING_CONFIG);
    expect(template.scoringConfig.baseScore).toBe(50);
  });

  it('accepts a custom scoring config on create', () => {
    const template = PublishingTemplate.create({
      name: 't',
      scoringConfig: { baseScore: 10, gates: { minScore: 0 } },
    });
    expect(template.scoringConfig.baseScore).toBe(10);
    expect(template.scoringConfig.gates.minScore).toBe(0);
    expect(template.scoringConfig.bonuses.liquidityHigh).toBe(20);
  });

  it('setScoringConfig merges over current config (prior customs kept)', () => {
    const template = PublishingTemplate.create({
      name: 't',
      scoringConfig: { baseScore: 10 },
    });
    template.setScoringConfig({ gates: { minScore: 0 } });
    expect(template.scoringConfig.baseScore).toBe(10);
    expect(template.scoringConfig.gates.minScore).toBe(0);
  });

  it('rejects out-of-range patches and leaves the stored config intact', () => {
    const template = PublishingTemplate.create({ name: 't' });
    expect(() => template.setScoringConfig({ baseScore: 101 })).toThrow(
      DomainError,
    );
    expect(() =>
      template.setScoringConfig({
        tiers: { strong: 10, decent: 60, neutral: 40, risky: 20 },
      }),
    ).toThrow(DomainError);
    expect(() =>
      template.updateConfig({ scoringConfig: { baseScore: -1 } }),
    ).toThrow(DomainError);
    expect(template.scoringConfig).toEqual(DEFAULT_SCORING_CONFIG);
  });
});
