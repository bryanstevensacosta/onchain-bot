import {
  SCHEDULING_TARGETS,
  dayKeyFor,
  isSchedulingTarget,
  type SchedulingTarget,
} from './scheduling-target';

describe('scheduling-target', () => {
  it('exposes exactly the telegram + threads targets (P38)', () => {
    expect([...SCHEDULING_TARGETS]).toEqual(['telegram', 'threads']);
  });

  it('accepts both targets and rejects anything else', () => {
    expect(isSchedulingTarget('telegram')).toBe(true);
    expect(isSchedulingTarget('threads')).toBe(true);
    expect(isSchedulingTarget('crypto-news')).toBe(false);
    expect(isSchedulingTarget('')).toBe(false);
  });

  it('narrows the type on guard success', () => {
    const raw = 'threads';
    if (isSchedulingTarget(raw)) {
      const target: SchedulingTarget = raw;
      expect(target).toBe('threads');
    } else {
      throw new Error('guard must accept threads');
    }
  });

  it('builds UTC day keys that roll over at midnight', () => {
    expect(dayKeyFor(new Date('2026-09-25T23:59:59.000Z'))).toBe('2026-09-25');
    expect(dayKeyFor(new Date('2026-09-26T00:00:00.000Z'))).toBe('2026-09-26');
  });

  it('pads single-digit months and days', () => {
    expect(dayKeyFor(new Date('2026-01-05T12:00:00.000Z'))).toBe('2026-01-05');
  });
});
