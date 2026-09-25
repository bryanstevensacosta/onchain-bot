import { describe, expect, it } from 'vitest';
import {
  avatarSrcFor,
  filterCallsBySources,
  formatMc,
  sortRankings,
  splitRankingHalves,
  timeAgo,
  togglePerfSort,
  trackingLabelFor,
} from './helpers';
import type { KolRankingRow } from './types';

describe('trackingLabelFor', () => {
  it('returns First time when timesCalled is 1', () => {
    expect(trackingLabelFor({ tracking: null, timesCalled: 1 })).toBe(
      'First time',
    );
  });

  it('returns Nx from last call when timesCalled > 1', () => {
    expect(trackingLabelFor({ tracking: null, timesCalled: 3 })).toBe(
      '3x from last call',
    );
  });

  it('prefers the server tracking label when present', () => {
    expect(
      trackingLabelFor({ tracking: '2x from last call', timesCalled: 2 }),
    ).toBe('2x from last call');
  });

  it('falls back to First time when tracking is mc n/a shaped empty', () => {
    expect(trackingLabelFor({ tracking: '', timesCalled: null })).toBe(
      'First time',
    );
  });
});

describe('timeAgo', () => {
  it('renders minutes ago', () => {
    const now = Date.parse('2026-09-25T12:00:00.000Z');
    expect(timeAgo('2026-09-25T11:52:00.000Z', now)).toBe('8m ago');
  });

  it('renders placeholder for null/invalid', () => {
    expect(timeAgo(null)).toBe('—');
    expect(timeAgo('not-a-date')).toBe('—');
  });
});

describe('formatMc', () => {
  it('formats millions and handles null', () => {
    expect(formatMc(2_500_000)).toBe('$2.50M');
    expect(formatMc(null)).toBe('—');
  });
});

describe('filterCallsBySources (P16)', () => {
  const rows = [{ kolId: 'a' }, { kolId: 'b' }, { kolId: 'c' }];

  it('empty selection = all sources', () => {
    expect(filterCallsBySources(rows, [])).toHaveLength(3);
  });

  it('two sources filter to their calls only', () => {
    const filtered = filterCallsBySources(rows, ['a', 'c']);
    expect(filtered.map((r) => r.kolId).sort()).toEqual(['a', 'c']);
  });
});

describe('splitRankingHalves (P17 5+5)', () => {
  it('splits 10 rows into 5 left + 5 right', () => {
    const rows = Array.from({ length: 10 }, (_, i) => i);
    const { left, right } = splitRankingHalves(rows);
    expect(left).toHaveLength(5);
    expect(right).toHaveLength(5);
    expect(left[0]).toBe(0);
    expect(right[0]).toBe(5);
  });
});

describe('togglePerfSort', () => {
  it('toggles asc<->desc', () => {
    expect(togglePerfSort('perf_desc')).toBe('perf_asc');
    expect(togglePerfSort('perf_asc')).toBe('perf_desc');
  });
});

describe('sortRankings', () => {
  const rows: Array<KolRankingRow> = [
    {
      caller: 'b',
      window: '30d',
      totalX: 2,
      callsCount: 9,
      strongCalls: 0,
      display: '+2X',
    },
    {
      caller: 'a',
      window: '30d',
      totalX: 10,
      callsCount: 1,
      strongCalls: 1,
      display: '+10X',
    },
  ];

  it('sorts perf_desc by totalX', () => {
    expect(sortRankings(rows, 'perf_desc')[0]?.caller).toBe('a');
  });

  it('sorts perf_asc inverted', () => {
    expect(sortRankings(rows, 'perf_asc')[0]?.caller).toBe('b');
  });

  it('sorts calls_desc by callsCount', () => {
    expect(sortRankings(rows, 'calls_desc')[0]?.caller).toBe('b');
  });
});

describe('avatarSrcFor (avatar 404 -> placeholder)', () => {
  it('prefers avatarUrl when present', () => {
    expect(avatarSrcFor('https://cdn/x.png', 'ch1')).toBe('https://cdn/x.png');
  });

  it('falls back to the kol-avatar contract URL', () => {
    expect(avatarSrcFor(null, 'ch1')).toBe('/ingestion-api/kol-avatar/ch1');
  });

  it('falls back to placeholder without channel', () => {
    expect(avatarSrcFor(null, '')).toBe('placeholder-avatar');
  });
});
