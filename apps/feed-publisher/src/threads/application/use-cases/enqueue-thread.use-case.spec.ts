import { Thread } from '../../domain/entities/thread.entity';
import { EnqueueThreadUseCase } from './enqueue-thread.use-case';
import { InMemoryThreadRepository } from '../../infrastructure/persistence/in-memory/in-memory-thread.repository';

describe('EnqueueThreadUseCase', () => {
  it('moves DRAFT -> QUEUED', async () => {
    const repo = new InMemoryThreadRepository();
    const thread = Thread.create({ id: 't1', messages: [{ content: 'x' }] });
    await repo.save(thread);
    const useCase = new EnqueueThreadUseCase(repo);
    const { thread: queued } = await useCase.execute('t1');
    expect(queued.status).toBe('QUEUED');
  });

  it('404s on unknown threads', async () => {
    const repo = new InMemoryThreadRepository();
    const useCase = new EnqueueThreadUseCase(repo);
    await expect(useCase.execute('missing')).rejects.toThrow('not found');
  });

  it('rejects enqueueing a non-DRAFT thread (CONFLICT)', async () => {
    const repo = new InMemoryThreadRepository();
    const thread = Thread.create({ id: 't1', messages: [{ content: 'x' }] });
    thread.enqueue();
    await repo.save(thread);
    const useCase = new EnqueueThreadUseCase(repo);
    await expect(useCase.execute('t1')).rejects.toThrow();
  });
});
