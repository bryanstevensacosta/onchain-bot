import { Thread } from '../../domain/entities/thread.entity';
import { ThreadSchedulerService } from './thread-scheduler.service';

function makeThread(): Thread {
  return Thread.create({
    id: 't1',
    messages: [
      { content: 'first', delaySeconds: 0 },
      { content: 'second', delaySeconds: 60 },
      { content: 'third', delaySeconds: 60 },
    ],
    createdAt: new Date('2026-09-25T10:00:00.000Z'),
  });
}

describe('ThreadSchedulerService', () => {
  it('releases only messages whose cumulative delay elapsed', () => {
    const scheduler = new ThreadSchedulerService();
    const thread = makeThread();
    const at = (s: number) =>
      new Date(new Date('2026-09-25T10:00:00.000Z').getTime() + s * 1000);
    expect(
      scheduler.dueMessages(thread, at(0)).map((m) => m.index),
    ).toEqual([0]);
    expect(
      scheduler.dueMessages(thread, at(60)).map((m) => m.index),
    ).toEqual([0, 1]);
    expect(
      scheduler.dueMessages(thread, at(120)).map((m) => m.index),
    ).toEqual([0, 1, 2]);
  });

  it('nextMessageDueAt points at the first unpublished message due time', () => {
    const scheduler = new ThreadSchedulerService();
    const thread = makeThread();
    thread.enqueue();
    thread.beginAttempt();
    thread.markMessagePublished(0, 'remote-0');
    const dueAt = scheduler.nextMessageDueAt(
      thread,
      new Date('2026-09-25T10:00:00.000Z'),
    );
    expect(dueAt).toEqual(new Date('2026-09-25T10:01:00.000Z'));
  });

  it('nextMessageDueAt is null once every message is published', () => {
    const scheduler = new ThreadSchedulerService();
    const thread = Thread.create({ messages: [{ content: 'solo' }] });
    thread.enqueue();
    thread.beginAttempt();
    thread.markMessagePublished(0, 'remote-0');
    expect(
      scheduler.nextMessageDueAt(thread, new Date('2026-09-25T10:05:00.000Z')),
    ).toBeNull();
  });

  it('computeBackoffMs doubles from 1s and caps at 30s', () => {
    const scheduler = new ThreadSchedulerService();
    expect(scheduler.computeBackoffMs(0)).toBe(1000);
    expect(scheduler.computeBackoffMs(1)).toBe(2000);
    expect(scheduler.computeBackoffMs(4)).toBe(16000);
    expect(scheduler.computeBackoffMs(5)).toBe(30000);
    expect(scheduler.computeBackoffMs(99)).toBe(30000);
  });

  it('isAttemptDue honours the backoff hold on IN_PROGRESS', () => {
    const scheduler = new ThreadSchedulerService();
    const thread = makeThread();
    thread.enqueue();
    thread.beginAttempt();
    const retryAt = new Date('2026-09-25T10:05:00.000Z');
    thread.markTransient('rate limited', retryAt);
    expect(
      scheduler.isAttemptDue(thread, new Date('2026-09-25T10:04:59.999Z')),
    ).toBe(false);
    expect(
      scheduler.isAttemptDue(thread, new Date('2026-09-25T10:05:00.000Z')),
    ).toBe(true);
  });
});
