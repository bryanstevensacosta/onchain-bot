import { InMemoryTemplateRepository } from '../../infrastructure/repositories/in-memory-template.repository';
import { PublishingTemplate } from '../../domain/entities/publishing-template.entity';
import { ActivateTemplateUseCase } from './activate-template.use-case';

describe('ActivateTemplateUseCase (todo 10, failing-first)', () => {
  it('activates and deactivates a template', async () => {
    const repo = new InMemoryTemplateRepository();
    await repo.save(
      PublishingTemplate.create({ id: 't', name: 't', active: false }),
    );
    const useCase = new ActivateTemplateUseCase(repo);
    expect(
      (await useCase.execute({ id: 't', active: true })).template.active,
    ).toBe(true);
    expect(
      (await useCase.execute({ id: 't', active: false })).template.active,
    ).toBe(false);
  });

  it('returns NOT_FOUND for missing templates', async () => {
    const useCase = new ActivateTemplateUseCase(
      new InMemoryTemplateRepository(),
    );
    await expect(
      useCase.execute({ id: 'nope', active: true }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
