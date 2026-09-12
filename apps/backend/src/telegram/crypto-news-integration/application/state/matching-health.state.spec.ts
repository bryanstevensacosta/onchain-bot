import { MatchingHealthState } from './matching-health.state';

describe('MatchingHealthState', () => {
  it('starts empty (nulls + zero failures)', () => {
    const state = new MatchingHealthState();

    expect(state.lastTickAt).toBeNull();
    expect(state.lastFetchOk).toBeNull();
    expect(state.consecutiveFetchFailures).toBe(0);
    expect(state.lastEnqueuedAt).toBeNull();
  });

  it('recordFetchSuccess stamps the tick, marks ok, resets the failure counter', () => {
    const state = new MatchingHealthState();
    state.recordFetchFailure(new Date('2026-09-12T00:00:00.000Z'));
    state.recordFetchFailure(new Date('2026-09-12T00:01:00.000Z'));
    expect(state.consecutiveFetchFailures).toBe(2);

    state.recordFetchSuccess(new Date('2026-09-12T00:02:00.000Z'));

    expect(state.lastTickAt).toBe('2026-09-12T00:02:00.000Z');
    expect(state.lastFetchOk).toBe(true);
    expect(state.consecutiveFetchFailures).toBe(0);
    // Success alone does not imply anything was enqueued.
    expect(state.lastEnqueuedAt).toBeNull();
  });

  it('recordFetchFailure stamps the tick, marks not-ok, increments the counter', () => {
    const state = new MatchingHealthState();

    state.recordFetchFailure(new Date('2026-09-12T00:00:00.000Z'));
    state.recordFetchFailure(new Date('2026-09-12T00:01:00.000Z'));

    expect(state.lastTickAt).toBe('2026-09-12T00:01:00.000Z');
    expect(state.lastFetchOk).toBe(false);
    expect(state.consecutiveFetchFailures).toBe(2);
  });

  it('recordEnqueued stamps lastEnqueuedAt without touching fetch fields', () => {
    const state = new MatchingHealthState();
    state.recordFetchSuccess(new Date('2026-09-12T00:02:00.000Z'));

    state.recordEnqueued(new Date('2026-09-12T00:03:00.000Z'));

    expect(state.lastEnqueuedAt).toBe('2026-09-12T00:03:00.000Z');
    expect(state.lastTickAt).toBe('2026-09-12T00:02:00.000Z');
    expect(state.lastFetchOk).toBe(true);
  });
});
