import { Thread } from '../../../domain/entities/thread.entity';
import { InMemoryThreadRepository } from './in-memory-thread.repository';

const AT = new Date('2026-09-25T10:00:00.000Z');

describe('InMemoryThreadRepository', () => {
  it('saves and finds by id', async () => {
    const repo = new InMemoryThreadRepository();
    const thread = Thread.create({ id: 't1', messages: [{ content: 'x' }] });
    await repo.save(thread);
    expect(await repo.findById('t1')).toBe(thread);
    expect(await repo.findById('missing')).toBeNull();
  });

  it('findDueToPublish returns QUEUED oldest-first, capped by limit', async () => {
    const repo = new InMemoryThreadRepository();
    for (const id of ['b', 'a']) {
      const thread = Thread.create({ id, messages: [{ content: id }] });
      thread.enqueue();
      await repo.save(thread);
    }
    const draft = Thread.create({
      id: 'draft',
      messages: [{ content: 'draft' }],
    });
    await repo.save(draft);
    const due = await repo.findDueToPublish(AT, 10);
    expect(due.map((t) => t.id)).toEqual(['b', 'a']);
    expect(await repo.findDueToPublish(AT, 1)).toHaveLength(1);
  });

  it('counts stored threads', async () => {
    const repo = new InMemoryThreadRepository();
    expect(await repo.count()).toBe(0);
    await repo.save(Thread.create({ messages: [{ content: 'x' }] }));
    expect(await repo.count()).toBe(1);
  });
});
