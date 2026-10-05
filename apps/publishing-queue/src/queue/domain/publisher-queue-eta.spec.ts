import { PublisherQueueEntry } from './publisher-queue-entry.entity';
import { PublisherQueueMapper } from '../infrastructure/persistence/typeorm/mappers/publisher-queue.mapper';
import { createDeliveryEta, rollDelayMs } from './queue-eta';

function makeInput(overrides = {}) {
  return {
    contentType: 'crypto-news',
    channelId: '-1001234',
    messageId: 42,
    rawContent: 'ETF inflows hit record highs',
    ...overrides,
  };
}

/**
 * R-b1 ETA seam (failing-first): queue entries carry a delivery ETA
 * (`etaMs` + `deadlineAt`, nullable for exact-time posts) plus a
 * `late` flag. `releaseToPending()` must preserve the deadline (no
 * re-roll on retry); `markScheduled`/`markPublishing` leave ETA
 * untouched; `markPublished` past the deadline marks `late`.
 */
describe('PublisherQueueEntry ETA (R-b1)', () => {
  it('defaults to no ETA and not late', () => {
    const entry = PublisherQueueEntry.create(makeInput({}));
    expect(entry.etaMs).toBeNull();
    expect(entry.deadlineAt).toBeNull();
    expect(entry.late).toBe(false);
  });

  it('persists ETA supplied at create()', () => {
    const deadlineAt = new Date('2026-10-06T00:01:00.000Z');
    const entry = PublisherQueueEntry.create(
      makeInput({ etaMs: 60_000, deadlineAt }),
    );
    expect(entry.etaMs).toBe(60_000);
    expect(entry.deadlineAt).toEqual(deadlineAt);
    expect(entry.late).toBe(false);
  });

  it('releaseToPending() preserves etaMs/deadlineAt (no re-roll)', () => {
    const deadlineAt = new Date('2026-10-06T00:01:00.000Z');
    const entry = PublisherQueueEntry.create(
      makeInput({ etaMs: 60_000, deadlineAt }),
    );
    entry.markPublishing();
    entry.releaseToPending();
    expect(entry.status).toBe('PENDING');
    expect(entry.etaMs).toBe(60_000);
    expect(entry.deadlineAt).toEqual(deadlineAt);
  });

  it('markScheduled/markPublishing leave ETA untouched', () => {
    const deadlineAt = new Date('2026-10-06T00:01:00.000Z');
    const entry = PublisherQueueEntry.create(
      makeInput({ etaMs: 60_000, deadlineAt }),
    );
    entry.markScheduled();
    expect(entry.etaMs).toBe(60_000);
    entry.markPublishing();
    expect(entry.deadlineAt).toEqual(deadlineAt);
    expect(entry.late).toBe(false);
  });

  it('markPublished past the deadline marks late', () => {
    const entry = PublisherQueueEntry.create(
      makeInput({
        etaMs: 60_000,
        deadlineAt: new Date('2026-10-06T00:01:00.000Z'),
      }),
    );
    entry.markPublishing();
    entry.markPublished('tg-1', undefined, new Date('2026-10-06T00:02:00.000Z'));
    expect(entry.status).toBe('PUBLISHED');
    expect(entry.late).toBe(true);
  });

  it('markPublished before the deadline stays on-time', () => {
    const entry = PublisherQueueEntry.create(
      makeInput({
        etaMs: 60_000,
        deadlineAt: new Date('2026-10-06T00:01:00.000Z'),
      }),
    );
    entry.markPublishing();
    entry.markPublished('tg-1', undefined, new Date('2026-10-06T00:00:30.000Z'));
    expect(entry.late).toBe(false);
  });

  it('mapper round-trips ETA fields both ways', () => {
    const deadlineAt = new Date('2026-10-06T00:01:00.000Z');
    const entry = PublisherQueueEntry.create(
      makeInput({ etaMs: 60_000, deadlineAt }),
    );
    const row = PublisherQueueMapper.toRow(entry);
    expect(row.etaMs).toBe(60_000);
    expect(row.deadlineAt).toEqual(deadlineAt);
    expect(row.late).toBe(false);
    const back = PublisherQueueMapper.toDomain(row);
    expect(back.etaMs).toBe(60_000);
    expect(back.deadlineAt).toEqual(deadlineAt);
    expect(back.late).toBe(false);
  });
});

describe('rollDelayMs / createDeliveryEta (R-b1)', () => {
  it('rolls within [minMs, maxMs] from the injected rng', () => {
    expect(rollDelayMs({ minMs: 1_000, maxMs: 5_000, rng: () => 0 })).toBe(
      1_000,
    );
    expect(
      rollDelayMs({ minMs: 1_000, maxMs: 5_000, rng: () => 0.5 }),
    ).toBe(3_000);
    const top = rollDelayMs({ minMs: 1_000, maxMs: 5_000, rng: () => 0.9999 });
    expect(top).toBeGreaterThanOrEqual(1_000);
    expect(top).toBeLessThanOrEqual(5_000);
  });

  it('rejects inverted or negative bounds', () => {
    expect(() =>
      rollDelayMs({ minMs: 5_000, maxMs: 1_000, rng: () => 0.5 }),
    ).toThrow();
    expect(() =>
      rollDelayMs({ minMs: -1, maxMs: 5_000, rng: () => 0.5 }),
    ).toThrow();
  });

  it('createDeliveryEta pins deadlineAt = now + etaMs', () => {
    const now = new Date('2026-10-06T00:00:00.000Z');
    const { etaMs, deadlineAt } = createDeliveryEta({
      delayMinMs: 60_000,
      delayMaxMs: 60_000,
      now,
      rng: () => 0.5,
    });
    expect(etaMs).toBe(60_000);
    expect(deadlineAt).toEqual(new Date('2026-10-06T00:01:00.000Z'));
  });
});
