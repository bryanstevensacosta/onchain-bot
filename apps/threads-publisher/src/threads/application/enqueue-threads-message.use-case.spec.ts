import { EnqueueThreadsMessageUseCase } from './enqueue-threads-message.use-case';
import { InMemoryThreadsQueueRepository } from '../infrastructure/in-memory-threads-queue.repository';
import { ThreadsKeyword } from '../domain/threads-keyword.entity';

function msg(id: number, content: string) {
  return {
    channelId: '-1001',
    messageId: id,
    content,
    matchedKeywords: [new ThreadsKeyword({ id: 'k1', phrase: 'news' })],
  };
}

describe('EnqueueThreadsMessageUseCase', () => {
  it('enqueues 600-char messages (never rejects by length)', async () => {
    const repo = new InMemoryThreadsQueueRepository();
    const useCase = new EnqueueThreadsMessageUseCase(repo);
    const entry = await useCase.execute(msg(1, 'x'.repeat(600)));
    expect(entry).not.toBeNull();
    expect(entry?.rawContent).toHaveLength(600);
  });

  it('is idempotent on PENDING duplicates', async () => {
    const repo = new InMemoryThreadsQueueRepository();
    const useCase = new EnqueueThreadsMessageUseCase(repo);
    const first = await useCase.execute(msg(2, 'hello'));
    const second = await useCase.execute(msg(2, 'hello'));
    expect(second?.id).toBe(first?.id);
    expect(await repo.countPending()).toBe(1);
  });

  it('caps the queue at THREADS_MAX_QUEUE_DEPTH=100', async () => {
    expect(EnqueueThreadsMessageUseCase.THREADS_MAX_QUEUE_DEPTH).toBe(100);
    const repo = new InMemoryThreadsQueueRepository();
    const useCase = new EnqueueThreadsMessageUseCase(repo);
    for (let i = 0; i < 105; i += 1) {
      await useCase.execute(msg(1000 + i, `msg ${i}`));
    }
    expect(await repo.countPending()).toBe(100);
  });
});
