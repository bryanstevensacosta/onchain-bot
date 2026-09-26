import { TemplateClassificationConfig } from './template-classification.config';

describe('TemplateClassificationConfig (P6, failing-first, todo 9)', () => {
  it('creates a valid per-template config (visible channels + score display + gem filters)', () => {
    const config = TemplateClassificationConfig.create({
      templateId: 'vip-calls',
      kolSourceIds: ['ch1', 'ch2'],
      minVisibleScore: 40,
      gemMinScore: 70,
      gemPatterns: ['\\$[A-Z]{2,10}', 'solana'],
    });
    expect(config.templateId).toBe('vip-calls');
    expect(config.isSourceVisible('ch1')).toBe(true);
    expect(config.isSourceVisible('ch9')).toBe(false);
    expect(config.isScoreVisible(40)).toBe(true);
    expect(config.isScoreVisible(39)).toBe(false);
  });

  it('empty kolSourceIds means all sources visible (P16 seed default)', () => {
    const config = TemplateClassificationConfig.create({
      templateId: 'vip-calls',
      kolSourceIds: [],
      minVisibleScore: 0,
      gemMinScore: 70,
      gemPatterns: [],
    });
    expect(config.isSourceVisible('anything')).toBe(true);
  });

  it('gem-filter example: score >= 70 AND enrichment regexes match', () => {
    const config = TemplateClassificationConfig.create({
      templateId: 'gems',
      kolSourceIds: [],
      minVisibleScore: 40,
      gemMinScore: 70,
      gemPatterns: ['\\$[A-Z]{2,10}', 'solana'],
    });
    const text = '$BONK solana memecoin runner liquidity $2.1M';
    expect(config.matchesGem({ score: 82, enrichmentText: text })).toBe(true);
    expect(config.matchesGem({ score: 65, enrichmentText: text })).toBe(false);
    expect(
      config.matchesGem({ score: 82, enrichmentText: 'plain update, no ticker' }),
    ).toBe(false);
  });

  it('rejects scores outside 0..100', () => {
    expect(() =>
      TemplateClassificationConfig.create({
        templateId: 'vip-calls',
        kolSourceIds: [],
        minVisibleScore: 101,
        gemMinScore: 70,
        gemPatterns: [],
      }),
    ).toThrow();
  });

  it('rejects invalid regex patterns fail-fast at creation', () => {
    expect(() =>
      TemplateClassificationConfig.create({
        templateId: 'vip-calls',
        kolSourceIds: [],
        minVisibleScore: 40,
        gemMinScore: 70,
        gemPatterns: ['([a-z'],
      }),
    ).toThrow();
  });

  it('rejects empty templateId', () => {
    expect(() =>
      TemplateClassificationConfig.create({
        templateId: '',
        kolSourceIds: [],
        minVisibleScore: 40,
        gemMinScore: 70,
        gemPatterns: [],
      }),
    ).toThrow();
  });
});
