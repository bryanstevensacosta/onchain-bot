import { describe, expect, it } from 'vitest';

import {
  PROFILE_NAME_RE,
  badgeTone,
  isValidProfileName,
  normalizeProfileName,
  paginate,
  splitKeywordGroups,
} from './profile-helpers';

describe('normalizeProfileName', () => {
  it('lowercases, dashes and trims', () => {
    expect(normalizeProfileName('  My Cool Profile!! ')).toBe(
      'my-cool-profile',
    );
  });

  it('collapses separators and strips edge dashes', () => {
    expect(normalizeProfileName('__a  --  b__')).toBe('a-b');
  });

  it('keeps digits', () => {
    expect(normalizeProfileName('Desk 42')).toBe('desk-42');
  });

  it('returns empty for blank input', () => {
    expect(normalizeProfileName('   ')).toBe('');
  });
});

describe('isValidProfileName', () => {
  it('accepts lowercase-dash slugs', () => {
    expect(isValidProfileName('my-profile-1')).toBe(true);
    expect(isValidProfileName('a')).toBe(true);
  });

  it('rejects uppercase, underscores, edge/double dashes and blanks', () => {
    for (const bad of [
      '',
      'My-Profile',
      'my_profile',
      '-lead',
      'trail-',
      'a--b',
      'has space',
    ]) {
      expect(isValidProfileName(bad)).toBe(false);
    }
  });

  it('matches PROFILE_NAME_RE', () => {
    expect(PROFILE_NAME_RE.test('desk-42')).toBe(true);
    expect(PROFILE_NAME_RE.test('Desk-42')).toBe(false);
  });
});

describe('badgeTone', () => {
  it('maps lifecycle badges to tones', () => {
    expect(badgeTone('Published')).toBe('green');
    expect(badgeTone('Pending to publish')).toBe('blue');
    expect(badgeTone('Not matched')).toBe('gray');
    expect(badgeTone('Not found')).toBe('gray');
    expect(badgeTone('Failed')).toBe('red');
  });

  it('maps any Blocked by phrase to amber', () => {
    expect(badgeTone('Blocked by scam')).toBe('amber');
    expect(badgeTone('Blocked by duplicate of -1001:7')).toBe('amber');
  });
});

describe('paginate', () => {
  const items = [1, 2, 3, 4, 5, 6, 7];

  it('slices pages and reports totals', () => {
    const first = paginate(items, 1, 5);
    expect(first.pageItems).toEqual([1, 2, 3, 4, 5]);
    expect(first.totalPages).toBe(2);
    expect(first.total).toBe(7);
    expect(paginate(items, 2, 5).pageItems).toEqual([6, 7]);
  });

  it('clamps out-of-range pages', () => {
    expect(paginate(items, 99, 5).page).toBe(2);
    expect(paginate(items, 0, 5).page).toBe(1);
    expect(paginate([], 1, 5)).toEqual({
      pageItems: [],
      page: 1,
      totalPages: 1,
      total: 0,
    });
  });
});

describe('splitKeywordGroups', () => {
  it('splits single vs compound AND-groups', () => {
    const rows = [
      { id: 'k1', phrase: 'etf', andGroupId: null },
      { id: 'k2', phrase: 'sol', andGroupId: 'g1' },
      { id: 'k3', phrase: 'inflows', andGroupId: 'g1' },
    ];
    const split = splitKeywordGroups(rows);
    expect(split.single.map((r) => r.id)).toEqual(['k1']);
    expect(split.compound).toHaveLength(1);
    expect(split.compound[0].groupId).toBe('g1');
    expect(split.compound[0].rows.map((r) => r.id)).toEqual(['k2', 'k3']);
  });
});
