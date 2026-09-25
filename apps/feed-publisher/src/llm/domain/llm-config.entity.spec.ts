import { LlmConfig } from './llm-config.entity';

describe('LlmConfig', () => {
  const base = {
    defaultTemplateId: 'default-feed',
    dailyCap: 36,
    dailyResetUtcHour: 0,
    randomDelayMinMs: 1000,
    randomDelayMaxMs: 5000,
    llmMaxAttempts: 3,
  };

  it('loads fail-closed (llm + publishing off, non-Latin rejected)', () => {
    const cfg = LlmConfig.load({ ...base });
    expect(cfg.id).toBe(1);
    expect(cfg.llmEnabled).toBe(false);
    expect(cfg.publishingEnabled).toBe(false);
    expect(cfg.rejectNonLatin).toBe(true);
    expect(cfg.shouldGenerateLlm()).toBe(false);
  });

  it('generates LLM output only when llm AND publishing are on', () => {
    const cfg = LlmConfig.load({ ...base });
    cfg.update({ llmEnabled: true });
    expect(cfg.shouldGenerateLlm()).toBe(false);
    cfg.update({ publishingEnabled: true });
    expect(cfg.shouldGenerateLlm()).toBe(true);
    cfg.update({ llmEnabled: false });
    expect(cfg.shouldGenerateLlm()).toBe(false);
  });

  it('rejects an empty default template binding', () => {
    expect(() => LlmConfig.load({ ...base, defaultTemplateId: '  ' })).toThrow();
  });

  it('rejects invalid knobs on load and update', () => {
    expect(() => LlmConfig.load({ ...base, dailyCap: 0 })).toThrow();
    expect(() => LlmConfig.load({ ...base, dailyResetUtcHour: 24 })).toThrow();
    expect(() =>
      LlmConfig.load({ ...base, randomDelayMinMs: 5000, randomDelayMaxMs: 1000 }),
    ).toThrow();
    expect(() => LlmConfig.load({ ...base, llmMaxAttempts: 0 })).toThrow();
    const cfg = LlmConfig.load({ ...base });
    expect(() => cfg.update({ dailyCap: 0 })).toThrow();
    expect(() => cfg.setDefaultTemplateId('')).toThrow();
  });

  it('swaps the default template binding and bumps updatedAt', () => {
    const cfg = LlmConfig.load({ ...base });
    const before = cfg.updatedAt;
    cfg.setDefaultTemplateId('threads-digest');
    expect(cfg.defaultTemplateId).toBe('threads-digest');
    expect(cfg.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});
