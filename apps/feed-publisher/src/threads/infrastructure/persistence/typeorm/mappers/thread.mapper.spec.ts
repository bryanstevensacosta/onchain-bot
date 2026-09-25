import { Thread } from '../../../../domain/entities/thread.entity';
import { toThreadOrm, fromThreadOrm } from './thread.mapper';

describe('ThreadMapper (TypeORM shape, unwired GAP-1)', () => {
  it('round-trips a thread with publish progress', () => {
    const thread = Thread.create({
      id: 't1',
      messages: [
        { content: 'first', mediaUrls: ['https://cdn/x.png'] },
        { content: 'second', delaySeconds: 60 },
      ],
      createdAt: new Date('2026-09-25T10:00:00.000Z'),
    });
    thread.enqueue();
    thread.beginAttempt();
    thread.markMessagePublished(0, 'remote-0');
    const { threadRow, messageRows } = toThreadOrm(thread);
    expect(threadRow.id).toBe('t1');
    expect(messageRows).toHaveLength(2);
    const restored = fromThreadOrm(threadRow, messageRows);
    expect(restored.toSnapshot()).toEqual(thread.toSnapshot());
  });
});
