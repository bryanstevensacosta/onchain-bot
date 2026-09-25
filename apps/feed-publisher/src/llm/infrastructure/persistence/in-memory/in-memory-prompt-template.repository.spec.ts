import { InMemoryPromptTemplateRepository } from './in-memory-prompt-template.repository';
import { PromptTemplate } from '../../../domain/prompt-template.entity';

const make = (name: string): PromptTemplate =>
  PromptTemplate.create({
    name,
    model: 'gpt-4o-mini',
    maxTokens: 800,
    temperature: 0.7,
    promptText: 'Rewrite:\n{{original}}',
  });

describe('InMemoryPromptTemplateRepository', () => {
  it('seeds the GLOBAL default-feed template', async () => {
    const repo = new InMemoryPromptTemplateRepository();
    const found = await repo.findById('default-feed');
    expect(found).not.toBeNull();
    expect(found!.contentType).toBe('global');
    await expect(repo.findAll()).resolves.toHaveLength(1);
  });

  it('saves, reads and deletes by id', async () => {
    const repo = new InMemoryPromptTemplateRepository();
    const created = make('threads-digest');
    await repo.save(created);
    await expect(repo.findById(created.id)).resolves.toBe(created);
    await expect(repo.delete(created.id)).resolves.toBe(true);
    await expect(repo.findById(created.id)).resolves.toBeNull();
    await expect(repo.delete('missing')).resolves.toBe(false);
  });
});
