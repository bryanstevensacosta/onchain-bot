// @vitest-environment jsdom
import '@/test/setup';

import { describe, expect, it } from 'vitest';

import { formatStaleAge } from './dexter-template-helpers';

/**
 * Stale-age copy (dexter plan todo 19b1): the disclosure badge
 * renders a human age from `staleAgeMs`, with `staleAsOf`/fallback
 * copy when the age is unusable — never a raw number, always
 * English (dexter page convention).
 */
describe('formatStaleAge (stale disclosure copy)', () => {
  it('renders sub-minute ages as just now', () => {
    expect(formatStaleAge(0)).toBe('just now');
    expect(formatStaleAge(59_999)).toBe('just now');
  });

  it('renders minutes / hours / days rungs', () => {
    expect(formatStaleAge(5 * 60_000)).toBe('5m ago');
    expect(formatStaleAge(3 * 3_600_000)).toBe('3h ago');
    expect(formatStaleAge(47 * 3_600_000)).toBe('47h ago');
    expect(formatStaleAge(50 * 3_600_000)).toBe('2d ago');
  });

  it('clamps negative ages to just now', () => {
    expect(formatStaleAge(-5)).toBe('just now');
  });

  it('falls back to the as-of date, then to generic copy', () => {
    expect(formatStaleAge(null, '2026-10-06T12:00:00.000Z')).toBe(
      'on 2026-10-06',
    );
    expect(formatStaleAge(undefined, null)).toBe('some time ago');
    expect(formatStaleAge(Number.NaN)).toBe('some time ago');
  });
});
