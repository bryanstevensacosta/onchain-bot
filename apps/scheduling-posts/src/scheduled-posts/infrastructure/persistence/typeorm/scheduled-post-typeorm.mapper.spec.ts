import { ScheduledPost } from '../../../domain/scheduled-post.entity';
import { ScheduledPostTypeormMapper } from './scheduled-post-typeorm.mapper';

describe('ScheduledPostTypeormMapper', () => {
  it('round-trips a fired post without losing state, key or message id', () => {
    const post = ScheduledPost.create({
      sessionId: 'morning-desk',
      binding: { target: 'telegram', bindingId: 'b-1', botId: 'bot_X', chatId: '-100123' },
      content: { kind: 'pre-written', text: 'GM', mediaIds: [], buttons: null },
      scheduleKind: { kind: 'once', fireAt: '2026-09-27T08:00:00.000Z' },
      idempotencyKey: '3f6b4c2a-0000-4000-8000-000000000001',
    }).markFired(777, '2026-09-27T08:00:01.000Z');
    const revived = ScheduledPostTypeormMapper.toDomain(
      ScheduledPostTypeormMapper.toOrm(post),
    );
    expect(revived.toSnapshot()).toEqual(post.toSnapshot());
  });
});
