import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { Thread } from './thread.entity';

function makeMessages(n: number): Array<{ content: string }> {
  return Array.from({ length: n }, (_, i) => ({ content: `msg ${i + 1}` }));
}

describe('Thread', () => {
  it('creates a DRAFT thread with indexed messages', () => {
    const thread = Thread.create({ id: 't1', messages: makeMessages(3) });
    expect(thread.id).toBe('t1');
    expect(thread.status).toBe('DRAFT');
    expect(thread.messages).toHaveLength(3);
    expect(thread.messages.map((m) => m.index)).toEqual([0, 1, 2]);
    expect(thread.messagesPublished).toBe(0);
    expect(thread.resumeIndex).toBe(0);
    expect(thread.lastPublishedMessageIndex).toBe(-1);
  });

  it('rejects empty message lists (VALIDATION)', () => {
    try {
      Thread.create({ messages: [] });
      fail('expected DomainError');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ErrorCode.VALIDATION);
    }
  });

  it('rejects blank content and negative delays (VALIDATION)', () => {
    for (const messages of [
      [{ content: '   ' }],
      [{ content: 'ok', delaySeconds: -1 }],
    ]) {
      try {
        Thread.create({ messages });
        fail('expected DomainError');
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe(ErrorCode.VALIDATION);
      }
    }
  });

  it('enqueues DRAFT -> QUEUED, rejects double enqueue (CONFLICT)', () => {
    const thread = Thread.create({ messages: makeMessages(1) });
    thread.enqueue();
    expect(thread.status).toBe('QUEUED');
    try {
      thread.enqueue();
      fail('expected DomainError');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ErrorCode.CONFLICT);
    }
  });

  it('beginAttempt requires QUEUED or PARTIAL (CONFLICT otherwise)', () => {
    const draft = Thread.create({ messages: makeMessages(1) });
    expect(() => draft.beginAttempt()).toThrow(DomainError);
    const queued = Thread.create({ messages: makeMessages(1) });
    queued.enqueue();
    queued.beginAttempt();
    expect(queued.status).toBe('IN_PROGRESS');
  });

  it('tracks per-message progress and exposes the resume index', () => {
    const thread = Thread.create({ messages: makeMessages(3) });
    thread.enqueue();
    thread.beginAttempt();
    thread.markMessagePublished(0, 'remote-0');
    expect(thread.messagesPublished).toBe(1);
    expect(thread.lastPublishedMessageIndex).toBe(0);
    expect(thread.resumeIndex).toBe(1);
    thread.markPartial('second failed');
    expect(thread.status).toBe('PARTIAL');
    // Resume continues from message 2 (index 1) — message 1 is never reposted.
    expect(thread.resumeIndex).toBe(1);
    thread.beginAttempt();
    thread.markMessagePublished(1, 'remote-1');
    thread.markMessagePublished(2, 'remote-2');
    thread.markCompleted();
    expect(thread.status).toBe('COMPLETED');
  });

  it('markCompleted requires every message published (VALIDATION)', () => {
    const thread = Thread.create({ messages: makeMessages(2) });
    thread.enqueue();
    thread.beginAttempt();
    thread.markMessagePublished(0, 'remote-0');
    expect(() => thread.markCompleted()).toThrow(DomainError);
  });

  it('FAILED is terminal: beginAttempt rejects, no retry (CONFLICT)', () => {
    const thread = Thread.create({ messages: makeMessages(2) });
    thread.enqueue();
    thread.beginAttempt();
    thread.markFailed('bad token');
    expect(thread.status).toBe('FAILED');
    expect(() => thread.beginAttempt()).toThrow(DomainError);
  });

  it('COMPLETED is terminal: beginAttempt rejects (CONFLICT)', () => {
    const thread = Thread.create({ messages: makeMessages(1) });
    thread.enqueue();
    thread.beginAttempt();
    thread.markMessagePublished(0, 'remote-0');
    thread.markCompleted();
    expect(() => thread.beginAttempt()).toThrow(DomainError);
  });

  it('transient failures hold IN_PROGRESS with backoff, attempts counted', () => {
    const thread = Thread.create({ messages: makeMessages(2) });
    thread.enqueue();
    thread.beginAttempt();
    const at = new Date('2026-09-25T10:00:00.000Z');
    const retryAt = new Date(at.getTime() + 1000);
    thread.markTransient('rate limited', retryAt);
    expect(thread.status).toBe('IN_PROGRESS');
    expect(thread.attempts).toBe(1);
    expect(thread.nextAttemptAt).toEqual(retryAt);
    expect(thread.isDue(new Date(at.getTime() + 500))).toBe(false);
    expect(thread.isDue(new Date(at.getTime() + 1000))).toBe(true);
  });

  it('isDue: QUEUED always due, PARTIAL due, DRAFT never due', () => {
    const now = new Date();
    const draft = Thread.create({ messages: makeMessages(1) });
    expect(draft.isDue(now)).toBe(false);
    draft.enqueue();
    expect(draft.isDue(now)).toBe(true);
    draft.beginAttempt();
    draft.markPartial('boom');
    expect(draft.isDue(now)).toBe(true);
  });

  it('toPublishState reports the spec failure-handling shape', () => {
    const thread = Thread.create({ id: 't9', messages: makeMessages(2) });
    thread.enqueue();
    thread.beginAttempt();
    thread.markMessagePublished(0, 'remote-0');
    thread.markPartial('second failed');
    expect(thread.toPublishState()).toEqual({
      threadId: 't9',
      messagesPublished: 1,
      lastPublishedMessageIndex: 0,
      status: 'PARTIAL',
      failureReason: 'second failed',
    });
  });

  it('rehydrates snapshots without replaying transitions', () => {
    const thread = Thread.create({ id: 't1', messages: makeMessages(2) });
    thread.enqueue();
    thread.beginAttempt();
    thread.markMessagePublished(0, 'remote-0');
    const snapshot = thread.toSnapshot();
    const restored = Thread.rehydrate(snapshot);
    expect(restored.toSnapshot()).toEqual(snapshot);
    expect(restored.status).toBe('IN_PROGRESS');
    expect(restored.resumeIndex).toBe(1);
  });
});
