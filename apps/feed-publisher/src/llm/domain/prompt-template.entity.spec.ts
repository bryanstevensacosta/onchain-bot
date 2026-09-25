import { PromptTemplate } from './prompt-template.entity';

describe('PromptTemplate', () => {
  const base = {
    name: 'default-feed',
    model: 'gpt-4o-mini',
    maxTokens: 800,
    temperature: 0.7,
    promptText: 'Rewrite:\n{{original}}',
  };

  it('creates a GLOBAL catalog entry reusable across content types', () => {
    const template = PromptTemplate.create({ ...base });
    expect(template.contentType).toBe('global');
    expect(template.appliesTo('crypto-news')).toBe(true);
    expect(template.appliesTo('threads')).toBe(true);
    expect(template.supportsVision).toBe(true);
  });

  it('scopes non-global templates to their own content type', () => {
    const template = PromptTemplate.create({ ...base, contentType: 'threads' });
    expect(template.appliesTo('threads')).toBe(true);
    expect(template.appliesTo('crypto-news')).toBe(false);
  });

  it('rejects invalid fields on create', () => {
    expect(() => PromptTemplate.create({ ...base, name: '  ' })).toThrow();
    expect(() => PromptTemplate.create({ ...base, maxTokens: 0 })).toThrow();
    expect(() => PromptTemplate.create({ ...base, maxTokens: 8001 })).toThrow();
    expect(() => PromptTemplate.create({ ...base, temperature: 3 })).toThrow();
    expect(() =>
      PromptTemplate.create({ ...base, reasoningEffort: 'ultra' as never }),
    ).toThrow();
    expect(() => PromptTemplate.create({ ...base, promptText: '' })).toThrow();
    expect(() =>
      PromptTemplate.create({ ...base, contentType: 'sms' as never }),
    ).toThrow();
  });

  it('applies partial updates and bumps updatedAt', () => {
    const template = PromptTemplate.create({ ...base });
    const before = template.updatedAt;
    template.update({ temperature: 0.2, contentType: 'crypto-news' });
    expect(template.temperature).toBe(0.2);
    expect(template.contentType).toBe('crypto-news');
    expect(template.model).toBe('gpt-4o-mini');
    expect(template.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});
