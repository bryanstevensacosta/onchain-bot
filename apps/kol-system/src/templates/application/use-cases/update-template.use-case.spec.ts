import { InMemoryTemplateRepository } from '../../infrastructure/repositories/in-memory-template.repository';
import { PublishingTemplate } from '../../domain/entities/publishing-template.entity';
import { UpdateTemplateUseCase } from './update-template.use-case';

describe('UpdateTemplateUseCase (todo 10, failing-first)', () => {
  it('patches config fields and persists', async () => {
    const repo = new InMemoryTemplateRepository();
    await repo.save(PublishingTemplate.create({ id: 't', name: 't' }));
    const useCase = new UpdateTemplateUseCase(repo, {
      validateSources: async (ids) => ({ valid: ids, unknownIds: [] }),
    });
    const { template } = await useCase.execute({
      id: 't',
      patch: {
        minVisibleScore: 60,
        rankingStrategy: 'recency',
        kolSourceIds: ['ch1'],
      },
    });
    expect(template.minVisibleScore).toBe(60);
    expect(template.rankingStrategy).toBe('recency');
    expect(template.kolSourceIds).toEqual(['ch1']);
  });

  it('rejects unknown source ids against the ingestion feed (P16)', async () => {
    const repo = new InMemoryTemplateRepository();
    await repo.save(PublishingTemplate.create({ id: 't', name: 't' }));
    const useCase = new UpdateTemplateUseCase(repo, {
      validateSources: async (ids) => ({
        valid: ids.filter((id) => id !== 'ghost'),
        unknownIds: ids.filter((id) => id === 'ghost'),
      }),
    });
    await expect(
      useCase.execute({ id: 't', patch: { kolSourceIds: ['ghost'] } }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('returns NOT_FOUND for missing templates', async () => {
    const useCase = new UpdateTemplateUseCase(
      new InMemoryTemplateRepository(),
      {
        validateSources: async (ids) => ({ valid: ids, unknownIds: [] }),
      },
    );
    await expect(
      useCase.execute({ id: 'nope', patch: {} }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
