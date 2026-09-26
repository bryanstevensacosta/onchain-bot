import { DomainError } from '../../../shared/kernel/domain-error';
import { InMemoryTemplateRepository } from '../../infrastructure/repositories/in-memory-template.repository';
import { CreateTemplateUseCase } from './create-template.use-case';

describe('CreateTemplateUseCase (todo 10, failing-first)', () => {
  it('creates a template with defaults (threadConfig null, dashboard-only)', async () => {
    const repo = new InMemoryTemplateRepository();
    const useCase = new CreateTemplateUseCase(repo);
    const { template } = await useCase.execute({ name: 'vip-calls' });
    expect(template.id).toBe('vip-calls');
    expect(template.threadConfig).toBeNull();
    expect(template.canPublish()).toBe(false);
    expect(await repo.count()).toBe(1);
  });

  it('rejects duplicate names (same slug) with CONFLICT', async () => {
    const repo = new InMemoryTemplateRepository();
    const useCase = new CreateTemplateUseCase(repo);
    await useCase.execute({ name: 'vip-calls' });
    await expect(useCase.execute({ name: 'vip-calls' })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('rejects invalid config with VALIDATION', async () => {
    const repo = new InMemoryTemplateRepository();
    const useCase = new CreateTemplateUseCase(repo);
    await expect(useCase.execute({ name: '' })).rejects.toBeInstanceOf(
      DomainError,
    );
  });
});
