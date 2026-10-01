import { Thread } from '../domain/entities/thread.entity';
import { ThreadsHealthIndicator } from './threads-health.indicator';
import { InMemoryThreadRepository } from '../infrastructure/persistence/in-memory/in-memory-thread.repository';

describe('ThreadsHealthIndicator', () => {
  it('reports up when the store reads', async () => {
    const repo = new InMemoryThreadRepository();
    await repo.save(Thread.create({ messages: [{ content: 'x' }] }));
    const indicator = new ThreadsHealthIndicator(repo);
    expect(await indicator.check()).toEqual({
      component: 'threads',
      status: 'up',
    });
  });

  it('reports down when the store throws', async () => {
    const repo = {
      count: async () => {
        throw new Error('db down');
      },
    } as never;
    const indicator = new ThreadsHealthIndicator(repo);
    expect(await indicator.check()).toEqual({
      component: 'threads',
      status: 'down',
    });
  });
});
