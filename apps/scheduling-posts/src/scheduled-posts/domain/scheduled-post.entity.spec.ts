import {
  ScheduledPost,
  type ScheduleKindOnce,
} from './scheduled-post.entity';

const BINDING = {
  target: 'telegram' as const,
  bindingId: 'b-1',
  botId: 'bot_X',
  chatId: '-100123',
};

function once(fireAt: string): ScheduleKindOnce {
  return { kind: 'once', fireAt };
}

describe('ScheduledPost', () => {
  it('creates a scheduled once post with a creation-time content snapshot', () => {
    const post = ScheduledPost.create({
      sessionId: 'morning-desk',
      binding: BINDING,
      content: { kind: 'pre-written', text: 'GM', mediaIds: [], buttons: null },
      scheduleKind: once('2026-09-27T08:00:00.000Z'),
      idempotencyKey: '3f6b4c2a-0000-4000-8000-000000000001',
    });
    expect(post.state).toBe('scheduled');
    expect(post.messageId).toBeNull();
    expect(post.firedAt).toBeNull();
    expect(post.reason).toBeNull();
  });

  it('rejects empty pre-written content and bad schedule shapes (422 class)', () => {
    expect(() =>
      ScheduledPost.create({
        sessionId: 's',
        binding: BINDING,
        content: { kind: 'pre-written', text: '  ', mediaIds: [], buttons: null },
        scheduleKind: once('2026-09-27T08:00:00.000Z'),
        idempotencyKey: 'k1',
      }),
    ).toThrow(/empty/);
    expect(() =>
      ScheduledPost.create({
        sessionId: 's',
        binding: BINDING,
        content: {
          kind: 'pre-written',
          text: 't',
          mediaIds: [],
          buttons: [{ text: 'b', url: 'not-a-url' }],
        },
        scheduleKind: once('2026-09-27T08:00:00.000Z'),
        idempotencyKey: 'k2',
      }),
    ).toThrow(/url/);
    expect(() =>
      ScheduledPost.create({
        sessionId: 's',
        binding: BINDING,
        content: { kind: 'content-ref', queueEntryId: '' },
        scheduleKind: once('2026-09-27T08:00:00.000Z'),
        idempotencyKey: 'k3',
      }),
    ).toThrow(/queueEntryId/);
  });

  it('runs the terminal state machine: scheduled -> fired | cancelled | failed', () => {
    const post = ScheduledPost.create({
      sessionId: 's',
      binding: BINDING,
      content: { kind: 'pre-written', text: 't', mediaIds: [], buttons: null },
      scheduleKind: once('2026-09-27T08:00:00.000Z'),
      idempotencyKey: 'k4',
    });
    const fired = post.markFired(777, '2026-09-27T08:00:01.000Z');
    expect(fired.state).toBe('fired');
    expect(fired.messageId).toBe(777);
    expect(() => fired.markFired(778, '2026-09-27T08:00:02.000Z')).toThrow(
      /terminal/,
    );
    expect(() => fired.cancel('s', 'x')).toThrow(/terminal/);

    const cancellable = ScheduledPost.create({
      sessionId: 's',
      binding: BINDING,
      content: { kind: 'pre-written', text: 't', mediaIds: [], buttons: null },
      scheduleKind: once('2026-09-27T08:00:00.000Z'),
      idempotencyKey: 'k5',
    });
    const cancelled = cancellable.cancel('s', 'SESSION_CLOSED');
    expect(cancelled.state).toBe('cancelled');
    expect(cancelled.reason).toBe('SESSION_CLOSED');
    expect(() => cancelled.markFailed('TARGET_DOWN')).toThrow(/terminal/);
  });

  it('refuses cross-session cancel (ownership)', () => {
    const post = ScheduledPost.create({
      sessionId: 's-a',
      binding: BINDING,
      content: { kind: 'pre-written', text: 't', mediaIds: [], buttons: null },
      scheduleKind: once('2026-09-27T08:00:00.000Z'),
      idempotencyKey: 'k6',
    });
    expect(() => post.cancel('s-b', 'user')).toThrow(/owner/);
  });

  it('round-trips through snapshot without losing the idempotency key', () => {
    const post = ScheduledPost.create({
      sessionId: 's',
      binding: BINDING,
      content: { kind: 'pre-written', text: 't', mediaIds: [], buttons: null },
      scheduleKind: { kind: 'cron', cronExpr: '0 8 * * *', timezone: 'UTC' },
      idempotencyKey: 'k7',
    });
    const revived = ScheduledPost.fromSnapshot(post.toSnapshot());
    expect(revived.idempotencyKey).toBe('k7');
    expect(revived.scheduleKind).toEqual({
      kind: 'cron',
      cronExpr: '0 8 * * *',
      timezone: 'UTC',
    });
  });
});
