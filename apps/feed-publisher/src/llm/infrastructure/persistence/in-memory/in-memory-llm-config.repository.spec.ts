import { InMemoryLlmConfigRepository } from './in-memory-llm-config.repository';

describe('InMemoryLlmConfigRepository', () => {
  it('seeds a single fail-closed row (id 1, default-feed binding)', async () => {
    const repo = new InMemoryLlmConfigRepository();
    const cfg = await repo.load();
    expect(cfg.id).toBe(1);
    expect(cfg.defaultTemplateId).toBe('default-feed');
    expect(cfg.llmEnabled).toBe(false);
    expect(cfg.publishingEnabled).toBe(false);
    expect(cfg.shouldGenerateLlm()).toBe(false);
  });

  it('persists flag updates across loads', async () => {
    const repo = new InMemoryLlmConfigRepository();
    const cfg = await repo.load();
    cfg.update({ llmEnabled: true, publishingEnabled: true });
    await repo.save(cfg);
    await expect(repo.load()).resolves.toMatchObject({
      llmEnabled: true,
      publishingEnabled: true,
    });
  });
});
