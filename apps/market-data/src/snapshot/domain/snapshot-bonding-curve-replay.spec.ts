/**
 * Persisted bonding-curve replay policy (`rick-compact-card` §10.16
 * replay follow-up, 2026-10-30): the env resolver + the structural /
 * freshness guard that decides whether a `snapshot_history.quote`
 * jsonb row may still render the short Dexter layout.
 */
import type { BondingCurveInfo } from './snapshot.types';
import {
  curveForReplay,
  resolveBondingCurveReplayMaxAgeMs,
  SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS_DEFAULT,
} from './snapshot-bonding-curve-replay';

const MAX_AGE_MS = 600_000;

const CURVE: BondingCurveInfo = {
  onCurve: true,
  launchpadId: 'pump-fun',
  quoteSymbol: 'Bitcoin',
  quoteMint: 'HytpiyuR3sVXGB5UqoqrnThCPH2X1tWVm5neep3Dpump',
  progressPercent: 65.69,
};

const withCurve = (patch: Record<string, unknown>): BondingCurveInfo => ({
  ...CURVE,
  ...patch,
});

describe('resolveBondingCurveReplayMaxAgeMs', () => {
  it('pins the 10-minute default when absent/blank/garbage', () => {
    expect(SNAPSHOT_BONDING_CURVE_REPLAY_MAX_AGE_MS_DEFAULT).toBe(600_000);
    expect(resolveBondingCurveReplayMaxAgeMs(undefined)).toBe(600_000);
    expect(resolveBondingCurveReplayMaxAgeMs(null)).toBe(600_000);
    expect(resolveBondingCurveReplayMaxAgeMs('')).toBe(600_000);
    expect(resolveBondingCurveReplayMaxAgeMs('   ')).toBe(600_000);
    expect(resolveBondingCurveReplayMaxAgeMs('garbage')).toBe(600_000);
    expect(resolveBondingCurveReplayMaxAgeMs({})).toBe(600_000);
    expect(resolveBondingCurveReplayMaxAgeMs([])).toBe(600_000);
    expect(resolveBondingCurveReplayMaxAgeMs(true)).toBe(600_000);
  });

  it('defaults on non-finite or non-positive values', () => {
    expect(resolveBondingCurveReplayMaxAgeMs(NaN)).toBe(600_000);
    expect(resolveBondingCurveReplayMaxAgeMs(Infinity)).toBe(600_000);
    expect(resolveBondingCurveReplayMaxAgeMs(-Infinity)).toBe(600_000);
    expect(resolveBondingCurveReplayMaxAgeMs(0)).toBe(600_000);
    expect(resolveBondingCurveReplayMaxAgeMs('0')).toBe(600_000);
    expect(resolveBondingCurveReplayMaxAgeMs(-1)).toBe(600_000);
    expect(resolveBondingCurveReplayMaxAgeMs('-5000')).toBe(600_000);
  });

  it('accepts numeric strings and floors fractional ms', () => {
    expect(resolveBondingCurveReplayMaxAgeMs('120000')).toBe(120_000);
    expect(resolveBondingCurveReplayMaxAgeMs(120_000)).toBe(120_000);
    expect(resolveBondingCurveReplayMaxAgeMs('120000.9')).toBe(120_000);
    expect(resolveBondingCurveReplayMaxAgeMs(1_500.75)).toBe(1_500);
  });

  it('a positive fraction that floors to 0 falls back to the default', () => {
    expect(resolveBondingCurveReplayMaxAgeMs(0.5)).toBe(600_000);
    expect(resolveBondingCurveReplayMaxAgeMs('0.9')).toBe(600_000);
  });
});

describe('curveForReplay — freshness bound', () => {
  it('serves the persisted curve verbatim inside the bound', () => {
    const served = curveForReplay(CURVE, 60_000, MAX_AGE_MS);
    expect(served).toBe(CURVE);
    expect(served).toEqual({
      onCurve: true,
      launchpadId: 'pump-fun',
      quoteSymbol: 'Bitcoin',
      quoteMint: 'HytpiyuR3sVXGB5UqoqrnThCPH2X1tWVm5neep3Dpump',
      progressPercent: 65.69,
    });
  });

  it('serves exactly AT the bound (inclusive)', () => {
    expect(curveForReplay(CURVE, MAX_AGE_MS, MAX_AGE_MS)).toBe(CURVE);
    expect(curveForReplay(CURVE, 0, MAX_AGE_MS)).toBe(CURVE);
  });

  it('nulls one millisecond past the bound (row may have graduated)', () => {
    expect(curveForReplay(CURVE, MAX_AGE_MS + 1, MAX_AGE_MS)).toBeNull();
    expect(curveForReplay(CURVE, 24 * 60 * 60 * 1000, MAX_AGE_MS)).toBeNull();
  });

  it('nulls negative, NaN or non-numeric ages', () => {
    expect(curveForReplay(CURVE, -1, MAX_AGE_MS)).toBeNull();
    expect(curveForReplay(CURVE, NaN, MAX_AGE_MS)).toBeNull();
    expect(curveForReplay(CURVE, null, MAX_AGE_MS)).toBeNull();
    expect(curveForReplay(CURVE, undefined, MAX_AGE_MS)).toBeNull();
    expect(
      curveForReplay(CURVE, '60000' as unknown as number, MAX_AGE_MS),
    ).toBeNull();
  });

  it('nulls a non-finite maxAgeMs', () => {
    expect(curveForReplay(CURVE, 0, NaN)).toBeNull();
    expect(curveForReplay(CURVE, 0, Infinity)).toBeNull();
  });
});

describe('curveForReplay — structural guard (dexter parity)', () => {
  it('null/undefined curve resolves null (legacy row without the key)', () => {
    expect(curveForReplay(null, 0, MAX_AGE_MS)).toBeNull();
    expect(curveForReplay(undefined, 0, MAX_AGE_MS)).toBeNull();
  });

  it('rejects arrays and non-objects', () => {
    expect(
      curveForReplay([CURVE] as unknown as BondingCurveInfo, 0, MAX_AGE_MS),
    ).toBeNull();
    expect(
      curveForReplay('pump-fun' as unknown as BondingCurveInfo, 0, MAX_AGE_MS),
    ).toBeNull();
    expect(
      curveForReplay(42 as unknown as BondingCurveInfo, 0, MAX_AGE_MS),
    ).toBeNull();
  });

  it('rejects onCurve !== true (null, false, truthy)', () => {
    expect(
      curveForReplay(withCurve({ onCurve: false }), 0, MAX_AGE_MS),
    ).toBeNull();
    expect(
      curveForReplay(withCurve({ onCurve: null }), 0, MAX_AGE_MS),
    ).toBeNull();
    expect(curveForReplay(withCurve({ onCurve: 1 }), 0, MAX_AGE_MS)).toBeNull();
  });

  it('rejects a missing, non-string, empty or blank launchpadId', () => {
    expect(
      curveForReplay(withCurve({ launchpadId: undefined }), 0, MAX_AGE_MS),
    ).toBeNull();
    expect(
      curveForReplay(withCurve({ launchpadId: 7 }), 0, MAX_AGE_MS),
    ).toBeNull();
    expect(
      curveForReplay(withCurve({ launchpadId: '' }), 0, MAX_AGE_MS),
    ).toBeNull();
    expect(
      curveForReplay(withCurve({ launchpadId: '   ' }), 0, MAX_AGE_MS),
    ).toBeNull();
  });

  it('rejects a present quoteSymbol/quoteMint that is not a non-empty string', () => {
    expect(
      curveForReplay(withCurve({ quoteSymbol: '' }), 0, MAX_AGE_MS),
    ).toBeNull();
    expect(
      curveForReplay(withCurve({ quoteSymbol: 5 }), 0, MAX_AGE_MS),
    ).toBeNull();
    expect(
      curveForReplay(withCurve({ quoteMint: '' }), 0, MAX_AGE_MS),
    ).toBeNull();
    expect(
      curveForReplay(withCurve({ quoteMint: {} }), 0, MAX_AGE_MS),
    ).toBeNull();
  });

  it('accepts absent/null optional strings (legal wire nulls)', () => {
    const noSymbol = withCurve({ quoteSymbol: null });
    expect(curveForReplay(noSymbol, 0, MAX_AGE_MS)).toBe(noSymbol);
    const noMint = withCurve({ quoteMint: null });
    expect(curveForReplay(noMint, 0, MAX_AGE_MS)).toBe(noMint);
    const absent = { ...CURVE } as Record<string, unknown>;
    delete absent['quoteSymbol'];
    delete absent['quoteMint'];
    expect(
      curveForReplay(absent as unknown as BondingCurveInfo, 0, MAX_AGE_MS),
    ).toBe(absent);
  });

  it('rejects progressPercent outside [0, 100] or non-finite', () => {
    expect(
      curveForReplay(withCurve({ progressPercent: 101 }), 0, MAX_AGE_MS),
    ).toBeNull();
    expect(
      curveForReplay(withCurve({ progressPercent: -0.01 }), 0, MAX_AGE_MS),
    ).toBeNull();
    expect(
      curveForReplay(withCurve({ progressPercent: NaN }), 0, MAX_AGE_MS),
    ).toBeNull();
    expect(
      curveForReplay(withCurve({ progressPercent: Infinity }), 0, MAX_AGE_MS),
    ).toBeNull();
    expect(
      curveForReplay(withCurve({ progressPercent: '65' }), 0, MAX_AGE_MS),
    ).toBeNull();
  });

  it('accepts progressPercent at the 0/100 edges and null/absent', () => {
    const zero = withCurve({ progressPercent: 0 });
    expect(curveForReplay(zero, 0, MAX_AGE_MS)).toBe(zero);
    const hundred = withCurve({ progressPercent: 100 });
    expect(curveForReplay(hundred, 0, MAX_AGE_MS)).toBe(hundred);
    const nullProgress = withCurve({ progressPercent: null });
    expect(curveForReplay(nullProgress, 0, MAX_AGE_MS)).toBe(nullProgress);
    const absent = { ...CURVE } as Record<string, unknown>;
    delete absent['progressPercent'];
    expect(
      curveForReplay(absent as unknown as BondingCurveInfo, 0, MAX_AGE_MS),
    ).toBe(absent);
  });
});
