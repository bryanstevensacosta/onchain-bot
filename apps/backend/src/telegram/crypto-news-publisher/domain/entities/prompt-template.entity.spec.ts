import { PromptTemplate } from 'telegram/crypto-news-publisher/domain/entities/prompt-template.entity';

describe('PromptTemplate', () => {
  describe('create', () => {
    it('builds a template from valid inputs', () => {
      const tpl = PromptTemplate.create({
        name: 'Default',
        model: 'opencode-zen/deepseek-v4-flash',
        maxTokens: 2000,
        temperature: 0.7,
        reasoningEffort: 'medium',
        promptText: 'Rewrite: {{original}}',
      });

      expect(tpl.name).toBe('Default');
      expect(tpl.model).toBe('opencode-zen/deepseek-v4-flash');
      expect(tpl.maxTokens).toBe(2000);
      expect(tpl.temperature).toBe(0.7);
      expect(tpl.reasoningEffort).toBe('medium');
      expect(tpl.promptText).toBe('Rewrite: {{original}}');
      expect(tpl.description).toBeNull();
      expect(tpl.id).toEqual(expect.any(String));
      expect(tpl.createdAt).toBeInstanceOf(Date);
      expect(tpl.updatedAt).toBeInstanceOf(Date);
      expect(tpl.createdAt.getTime()).toBe(tpl.updatedAt.getTime());
    });

    it('treats absent reasoningEffort as null', () => {
      const tpl = PromptTemplate.create({
        name: 't',
        model: 'm',
        maxTokens: 100,
        temperature: 0.5,
        promptText: 'p',
      });
      expect(tpl.reasoningEffort).toBeNull();
    });

    it('trims surrounding whitespace from name and promptText', () => {
      const tpl = PromptTemplate.create({
        name: '  Default  ',
        model: 'm',
        maxTokens: 100,
        temperature: 0.5,
        promptText: '  body  ',
      });
      expect(tpl.name).toBe('Default');
      expect(tpl.promptText).toBe('body');
    });

    it('preserves a provided id', () => {
      const id = crypto.randomUUID();
      const tpl = PromptTemplate.create({
        id,
        name: 'a',
        model: 'm',
        maxTokens: 100,
        temperature: 0.5,
        promptText: 'p',
      });
      expect(tpl.id).toBe(id);
    });
  });

  describe('validation', () => {
    const baseValid = {
      model: 'm',
      maxTokens: 100,
      temperature: 0.5,
      promptText: 'p',
    };

    it('throws when name is empty', () => {
      expect(() => PromptTemplate.create({ ...baseValid, name: '' })).toThrow(
        /name/,
      );
      expect(() =>
        PromptTemplate.create({ ...baseValid, name: '   ' }),
      ).toThrow(/name/);
    });

    it('throws when name exceeds 100 chars', () => {
      expect(() =>
        PromptTemplate.create({
          ...baseValid,
          name: 'a'.repeat(101),
        }),
      ).toThrow(/name|exceeds/);
    });

    it('throws when promptText is empty', () => {
      expect(() =>
        PromptTemplate.create({ ...baseValid, name: 'a', promptText: '' }),
      ).toThrow(/promptText/);
      expect(() =>
        PromptTemplate.create({ ...baseValid, name: 'a', promptText: '   ' }),
      ).toThrow(/promptText/);
    });

    it('throws when maxTokens < 1', () => {
      expect(() =>
        PromptTemplate.create({ ...baseValid, name: 'a', maxTokens: 0 }),
      ).toThrow(/maxTokens/);
    });

    it('throws when maxTokens > 8000', () => {
      expect(() =>
        PromptTemplate.create({ ...baseValid, name: 'a', maxTokens: 8001 }),
      ).toThrow(/maxTokens/);
    });

    it('accepts the boundary values for maxTokens', () => {
      expect(() =>
        PromptTemplate.create({ ...baseValid, name: 'a', maxTokens: 1 }),
      ).not.toThrow();
      expect(() =>
        PromptTemplate.create({ ...baseValid, name: 'a', maxTokens: 8000 }),
      ).not.toThrow();
    });

    it('throws when temperature is below 0', () => {
      expect(() =>
        PromptTemplate.create({ ...baseValid, name: 'a', temperature: -0.1 }),
      ).toThrow(/temperature/);
    });

    it('throws when temperature is above 2', () => {
      expect(() =>
        PromptTemplate.create({ ...baseValid, name: 'a', temperature: 2.1 }),
      ).toThrow(/temperature/);
    });

    it('accepts the boundary values for temperature', () => {
      expect(() =>
        PromptTemplate.create({ ...baseValid, name: 'a', temperature: 0 }),
      ).not.toThrow();
      expect(() =>
        PromptTemplate.create({ ...baseValid, name: 'a', temperature: 2 }),
      ).not.toThrow();
    });

    it('throws when model is empty', () => {
      expect(() =>
        PromptTemplate.create({ ...baseValid, name: 'a', model: '' }),
      ).toThrow(/model/);
      expect(() =>
        PromptTemplate.create({ ...baseValid, name: 'a', model: '   ' }),
      ).toThrow(/model/);
    });

    it('throws when reasoningEffort is not in the allowed set', () => {
      expect(() =>
        PromptTemplate.create({
          ...baseValid,
          name: 'a',
          // Cast through unknown because the domain type forbids this
          // value; we want to ensure the runtime guard catches it.
          reasoningEffort: 'ultra' as unknown as null,
        }),
      ).toThrow(/reasoningEffort/);
    });

    it('accepts null and the three allowed string values for reasoningEffort', () => {
      for (const value of [null, 'low', 'medium', 'high'] as const) {
        expect(() =>
          PromptTemplate.create({
            ...baseValid,
            name: 'a',
            reasoningEffort: value,
          }),
        ).not.toThrow();
      }
    });
  });

  describe('update', () => {
    const build = (): PromptTemplate =>
      PromptTemplate.create({
        name: 'Default',
        model: 'm1',
        maxTokens: 2000,
        temperature: 0.7,
        reasoningEffort: 'low',
        promptText: 'original',
      });

    it('updates the provided fields and bumps updatedAt', async () => {
      const tpl = build();
      const originalUpdatedAt = tpl.updatedAt;
      // Force a measurable clock delta.
      await new Promise((r) => setTimeout(r, 5));
      tpl.update({ name: 'New name', temperature: 0.3 });
      expect(tpl.name).toBe('New name');
      expect(tpl.temperature).toBe(0.3);
      expect(tpl.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime(),
      );
      // untouched fields preserved
      expect(tpl.model).toBe('m1');
      expect(tpl.maxTokens).toBe(2000);
      expect(tpl.reasoningEffort).toBe('low');
      expect(tpl.promptText).toBe('original');
    });

    it('trims whitespace on update', () => {
      const tpl = build();
      tpl.update({ name: '  with spaces  ', promptText: '  body  ' });
      expect(tpl.name).toBe('with spaces');
      expect(tpl.promptText).toBe('body');
    });

    it('rejects out-of-range maxTokens', () => {
      const tpl = build();
      expect(() => tpl.update({ maxTokens: 0 })).toThrow(/maxTokens/);
      expect(() => tpl.update({ maxTokens: 8001 })).toThrow(/maxTokens/);
    });

    it('rejects out-of-range temperature', () => {
      const tpl = build();
      expect(() => tpl.update({ temperature: -0.1 })).toThrow(/temperature/);
      expect(() => tpl.update({ temperature: 2.1 })).toThrow(/temperature/);
    });

    it('rejects empty name', () => {
      const tpl = build();
      expect(() => tpl.update({ name: '' })).toThrow(/name/);
    });

    it('rejects empty promptText', () => {
      const tpl = build();
      expect(() => tpl.update({ promptText: '' })).toThrow(/promptText/);
    });

    it('accepts null reasoningEffort', () => {
      const tpl = build();
      tpl.update({ reasoningEffort: null });
      expect(tpl.reasoningEffort).toBeNull();
    });
  });

  describe('reconstitute', () => {
    it('skips validation entirely', () => {
      const date = new Date('2026-01-01T00:00:00Z');
      const tpl = PromptTemplate.reconstitute({
        id: 'fixed',
        name: 'arbitrary',
        description: null,
        model: 'm',
        maxTokens: 1,
        temperature: 0,
        reasoningEffort: null,
        promptText: 'p',
        createdAt: date,
        updatedAt: date,
      });
      expect(tpl.id).toBe('fixed');
      expect(tpl.createdAt).toBe(date);
    });
  });
});
