import { describe, expect, it } from 'vitest';
import { formatPriceUsd, formatUsd } from './format';

/**
 * Money pins (dexter plan todos 64/65, owner re-pins 2026-10-17/18):
 * compact at K/M/B 1 decimal trimmed; below 1000 a nearest whole;
 * rounding carries the mantissa only, never the unit; sign preserved.
 */
describe('formatUsd (money rule — dexter todos 64/65)', () => {
  it('renders compact B/M/K at 1 decimal with trailing-zero strip', () => {
    // todo 64 re-pin: K/M/B at 1 dec (`1.46B`→`1.5B`; the old 2-dec
    // `30.22K`/`1.46B` rule is superseded)
    expect(formatUsd(2_500_000)).toBe('$2.5M');
    expect(formatUsd(1_460_000_000)).toBe('$1.5B');
    expect(formatUsd(80_000_000_000)).toBe('$80B');
    expect(formatUsd(55_670)).toBe('$55.7K');
  });

  it('renders a nearest whole integer below 1000', () => {
    // todo 65, SPEED evidence 2026-10-18: 752.1→752, 10.85→11,
    // 146.285→146, 749→749 — nearest, never truncation
    expect(formatUsd(983.78)).toBe('$984');
    expect(formatUsd(10.85)).toBe('$11');
    expect(formatUsd(0.94)).toBe('$1');
  });

  it('carries rounding into the mantissa only, never the unit', () => {
    // `999.96K` renders `1000K` (same as the old 2-dec rule; pinned,
    // NOT rolled up to `1M`)
    expect(formatUsd(999_960)).toBe('$1000K');
    expect(formatUsd(999_949)).toBe('$999.9K');
    // sub-1000 whole rounding up to `1000` (999.5–999.99…) → `1K`,
    // never a bare unit-less `1000` (todo 65 guard)
    expect(formatUsd(999.5)).toBe('$1K');
  });

  it('preserves the sign', () => {
    expect(formatUsd(-1_460_000_000)).toBe('-$1.5B');
  });

  it('renders the — glyph on nullish/non-finite', () => {
    expect(formatUsd(null)).toBe('—');
    expect(formatUsd(undefined)).toBe('—');
    expect(formatUsd(NaN)).toBe('—');
  });
});

/**
 * Price pins (dexter plan todo 66, owner re-pin 2026-10-18): `<1` fixed
 * 8 decimals half-up with trailing zeros stripped; ultra-dust below
 * 1e-8 falls back to the legacy 3-significant-figure rule; `>=1`
 * grouped max 2 decimals; zero renders `$0`.
 */
describe('formatPriceUsd (adaptive price — dexter todo 66)', () => {
  it('renders sub-1 prices at 8 decimals half-up, zeros stripped', () => {
    // SPEED evidence: DS raw 0.0000007521 → Rick `0.00000075`
    // (discriminates the old 3-significant-figures rule)
    expect(formatPriceUsd(0.00002434)).toBe('$0.00002434');
    expect(formatPriceUsd(0.00000075)).toBe('$0.00000075');
    expect(formatPriceUsd(0.5)).toBe('$0.5');
    expect(formatPriceUsd(0.012345)).toBe('$0.012345');
  });

  it('falls back to 3 significant figures below 1e-8 (never $0)', () => {
    // Ultra-dust collapses to `0` at 8 decimals → legacy todo-45 rule
    expect(formatPriceUsd(1.23e-9)).toBe('$0.00000000123');
  });

  it('renders >=1 grouped with max 2 decimals', () => {
    expect(formatPriceUsd(164.32)).toBe('$164.32');
    expect(formatPriceUsd(3457)).toBe('$3,457');
  });

  it('renders $0 for zero and — glyph for nullish', () => {
    expect(formatPriceUsd(0)).toBe('$0');
    expect(formatPriceUsd(null)).toBe('—');
  });
});
