import { SchedulingState } from './scheduling-state.entity';

describe('SchedulingState', () => {
  it('starts empty on both targets', () => {
    const state = SchedulingState.empty();
    expect(state.postsSinceLastAd).toBe(0);
    expect(state.cursorFor('telegram').lastAdId).toBeNull();
    expect(state.publishedTodayFor('threads', new Date())).toBe(0);
  });

  it('tracks per-target cursors independently', () => {
    const at = new Date('2026-09-25T10:00:00.000Z');
    const state = SchedulingState.empty().markPublished('telegram', 'a1', at);
    expect(state.cursorFor('telegram').lastAdId).toBe('a1');
    expect(state.cursorFor('telegram').lastPublishedAt).toBe(at);
    expect(state.publishedTodayFor('telegram', at)).toBe(1);
    expect(state.cursorFor('threads').lastAdId).toBeNull();
    expect(state.publishedTodayFor('threads', at)).toBe(0);
  });

  it('keeps the shared cadence across target publishes (reset is per tick)', () => {
    const state = SchedulingState.empty()
      .incrementPostsSinceLastAd()
      .incrementPostsSinceLastAd()
      .markPublished('threads', 'a9', new Date('2026-09-25T10:00:00.000Z'));
    expect(state.postsSinceLastAd).toBe(2);
    expect(state.resetPostsSinceLastAd().postsSinceLastAd).toBe(0);
  });

  it('rolls the daily counter on UTC day change', () => {
    const state = SchedulingState.empty()
      .markPublished('telegram', 'a1', new Date('2026-09-25T23:00:00.000Z'))
      .markPublished('telegram', 'a2', new Date('2026-09-26T01:00:00.000Z'));
    expect(
      state.publishedTodayFor('telegram', new Date('2026-09-26T02:00:00.000Z')),
    ).toBe(1);
    expect(
      state.publishedTodayFor('telegram', new Date('2026-09-25T23:30:00.000Z')),
    ).toBe(0);
  });

  it('reads a stale day key as zero without mutating', () => {
    const state = SchedulingState.empty().markPublished(
      'telegram',
      'a1',
      new Date('2026-09-25T10:00:00.000Z'),
    );
    expect(
      state.publishedTodayFor('telegram', new Date('2026-09-26T10:00:00.000Z')),
    ).toBe(0);
    expect(state.cursorFor('telegram').publishedToday).toBe(1);
  });
});
