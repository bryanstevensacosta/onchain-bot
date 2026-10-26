import {
  HOLDER_CONCENTRATION_PERCENT_EPSILON,
  HOLDER_CONCENTRATION_TOP10_N,
  HOLDER_CONCENTRATION_TOP_N,
  SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS_DEFAULT,
  resolveHolderConcentrationEnabled,
  resolveHolderConcentrationTimeoutMs,
} from './snapshot-holder-concentration';

/**
 * Holder concentration domain (`rick-compact-card` §10, lane TH).
 *
 * Pure env/policy pins: the own fetcher budget (`SNAPSHOT_HOLDER_
 * CONCENTRATION_TIMEOUT_MS`, default 1500 — same resolver shape as
 * `resolveHoneypotTimeoutMs`), the kill-switch (default ENABLED, only
 * explicit false-ish disables) and the frozen policy numbers the
 * calculator consumes (top-5 / top-10 / ε). No I/O here.
 */
describe('snapshot-holder-concentration domain', () => {
  it('pins the §10 policy numbers', () => {
    expect(HOLDER_CONCENTRATION_TOP_N).toBe(5);
    expect(HOLDER_CONCENTRATION_TOP10_N).toBe(10);
    expect(HOLDER_CONCENTRATION_PERCENT_EPSILON).toBe(1e-9);
  });

  it('defaults the own fetcher budget to 1500ms', () => {
    expect(SNAPSHOT_HOLDER_CONCENTRATION_TIMEOUT_MS_DEFAULT).toBe(1_500);
    expect(resolveHolderConcentrationTimeoutMs(undefined)).toBe(1_500);
  });

  it('accepts a positive override (Math.floor)', () => {
    expect(resolveHolderConcentrationTimeoutMs('2500')).toBe(2_500);
    expect(resolveHolderConcentrationTimeoutMs('1200.9')).toBe(1_200);
  });

  it('falls back to the default on garbage / non-positive / non-finite', () => {
    for (const raw of [
      '',
      '   ',
      'abc',
      '0',
      '-5',
      'NaN',
      'Infinity',
      '-Infinity',
    ]) {
      expect(resolveHolderConcentrationTimeoutMs(raw)).toBe(1_500);
    }
  });

  it('defaults the kill-switch ENABLED on unset/blank/truthy tokens', () => {
    for (const raw of [
      undefined,
      '',
      '   ',
      '1',
      'true',
      'yes',
      'on',
      'TRUE',
    ]) {
      expect(resolveHolderConcentrationEnabled(raw)).toBe(true);
    }
  });

  it('disables only on explicit false-ish tokens (0|false|off|no|disabled)', () => {
    for (const raw of ['0', 'false', 'off', 'no', 'disabled', ' FALSE ']) {
      expect(resolveHolderConcentrationEnabled(raw)).toBe(false);
    }
  });
});
