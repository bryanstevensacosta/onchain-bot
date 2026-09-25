import { CreateThreadUseCase } from './create-thread.use-case';
import { InMemoryThreadRepository } from '../../infrastructure/persistence/in-memory/in-memory-thread.repository';

describe('CreateThreadUseCase', () => {
  it('persists a DRAFT thread and returns it', async () => {
    const repo = new InMemoryThreadRepository();
    const useCase = new CreateThreadUseCase(repo);
    const { thread } = await useCase.execute({
      messages: [{ content: 'first' }, { content: 'second' }],
    });
    expect(thread.status).toBe('DRAFT');
    expect(await repo.findById(thread.id)).not.toBeNull();
  });

  it('rejects empty message lists (VALIDATION, nothing persisted)', async () => {
    const repo = new InMemoryThreadRepository();
    const useCase = new CreateThreadUseCase(repo);
    await expect(useCase.execute({ messages: [] })).rejects.toThrow();
    expect(await repo.count()).toBe(0);
  });
});
