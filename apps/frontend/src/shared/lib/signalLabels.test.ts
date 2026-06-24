import { describe, expect, it } from 'vitest';
import {
  FILTER_REASON_LABELS,
  HONEYPOT_SIGNAL_LABELS,
  RISK_LEVEL_LABELS,
  RISK_LEVEL_TONE,
  RISK_SIGNAL_LABELS,
  SCORING_FACTOR_LABELS,
  humanize,
  reasonLabel,
  riskLevelLabel,
  riskLevelTone,
  signalLabel,
} from './signalLabels';

describe('signalLabel', () => {
  it('looks up a risk signal without prefix', () => {
    expect(signalLabel('NO_HOLDERS')).toBe('No holders');
  });

  it('looks up a risk signal with SIGNAL_ prefix (stripped)', () => {
    expect(signalLabel('SIGNAL_NO_HOLDERS')).toBe('No holders');
  });

  it('looks up POSSIBLE_RUG risk signal', () => {
    expect(signalLabel('POSSIBLE_RUG')).toBe('Possible rug pull');
  });

  it('looks up POSSIBLE_RUG risk signal with SIGNAL_ prefix (stripped)', () => {
    expect(signalLabel('SIGNAL_POSSIBLE_RUG')).toBe('Possible rug pull');
  });

  it('looks up a honeypot signal', () => {
    expect(signalLabel('HONEYPOT_FLAG')).toBe('Honeypot flagged');
  });

  it('looks up SIGNAL_HONEYPOT scoring factor (preserved entry)', () => {
    expect(signalLabel('SIGNAL_HONEYPOT')).toBe('Honeypot risk');
  });

  it('looks up SIGNAL_BLACKLIST scoring factor (preserved entry)', () => {
    expect(signalLabel('SIGNAL_BLACKLIST')).toBe('Blacklist risk');
  });

  it('looks up a preserved scoring factor label', () => {
    expect(signalLabel('LIQUIDITY_HIGH')).toBe('High Liquidity');
  });

  it('falls back to humanize for unknown SIGNAL_ code', () => {
    expect(signalLabel('SIGNAL_FUTURE_THING')).toBe('Future thing');
  });

  it('falls back to humanize for unknown code without prefix', () => {
    expect(signalLabel('UNKNOWN_CODE')).toBe('Unknown code');
  });

  it('returns empty string for empty input', () => {
    expect(signalLabel('')).toBe('');
  });
});

describe('reasonLabel', () => {
  it('looks up SCORE_TOO_LOW', () => {
    expect(reasonLabel('SCORE_TOO_LOW')).toBe('Score too low');
  });

  it('looks up BLACKLISTED', () => {
    expect(reasonLabel('BLACKLISTED')).toBe('Blacklisted');
  });

  it('falls back to humanize for unknown reason', () => {
    expect(reasonLabel('UNKNOWN_REASON')).toBe('Unknown reason');
  });

  it('returns empty string for empty input', () => {
    expect(reasonLabel('')).toBe('');
  });
});

describe('riskLevelLabel', () => {
  it('returns Low risk for LOW', () => {
    expect(riskLevelLabel('LOW')).toBe('Low risk');
  });

  it('returns Medium risk for MEDIUM', () => {
    expect(riskLevelLabel('MEDIUM')).toBe('Medium risk');
  });

  it('returns High risk for HIGH', () => {
    expect(riskLevelLabel('HIGH')).toBe('High risk');
  });

  it('returns Critical risk for CRITICAL', () => {
    expect(riskLevelLabel('CRITICAL')).toBe('Critical risk');
  });

  it('falls back to humanize for unknown level', () => {
    expect(riskLevelLabel('UNKNOWN_LEVEL')).toBe('Unknown level');
  });
});

describe('riskLevelTone', () => {
  it('returns a valid BadgeTone for HIGH', () => {
    const validTones = [
      'green',
      'yellow',
      'amber',
      'orange',
      'red',
      'blue',
      'gray',
      'cyan',
      'white',
    ];
    expect(validTones).toContain(riskLevelTone('HIGH'));
  });

  it('returns gray for unknown level', () => {
    expect(riskLevelTone('UNKNOWN_LEVEL')).toBe('gray');
  });

  it('returns gray for LOW', () => {
    expect(riskLevelTone('LOW')).toBe('gray');
  });
});

describe('humanize', () => {
  it('converts NO_HOLDERS to No holders', () => {
    expect(humanize('NO_HOLDERS')).toBe('No holders');
  });

  it('converts SOMETHING_NEW to Something new', () => {
    expect(humanize('SOMETHING_NEW')).toBe('Something new');
  });

  it('uppercases the first character of lowercase input', () => {
    expect(humanize('already lowercase')).toBe('Already lowercase');
  });

  it('returns empty string for empty input', () => {
    expect(humanize('')).toBe('');
  });
});

describe('constants shape', () => {
  it('exposes 10 risk signal labels', () => {
    expect(Object.keys(RISK_SIGNAL_LABELS)).toHaveLength(10);
  });

  it('exposes 12 honeypot signal labels', () => {
    expect(Object.keys(HONEYPOT_SIGNAL_LABELS)).toHaveLength(12);
  });

  it('exposes 7 filter reason labels', () => {
    expect(Object.keys(FILTER_REASON_LABELS)).toHaveLength(7);
  });

  it('exposes 4 risk level labels', () => {
    expect(Object.keys(RISK_LEVEL_LABELS)).toHaveLength(4);
  });

  it('exposes 4 risk level tones', () => {
    expect(Object.keys(RISK_LEVEL_TONE)).toHaveLength(4);
  });

  it('includes all new SIGNAL_* scoring factors', () => {
    expect(SCORING_FACTOR_LABELS.SIGNAL_POSSIBLE_RUG).toBe('Possible rug pull');
    expect(SCORING_FACTOR_LABELS.SIGNAL_NO_HOLDERS).toBe('No holders');
    expect(SCORING_FACTOR_LABELS.SIGNAL_LOW_HOLDERS).toBe('Low holders');
    expect(SCORING_FACTOR_LABELS.SIGNAL_NO_NAME).toBe('No token name');
    expect(SCORING_FACTOR_LABELS.SIGNAL_LOW_LIQUIDITY).toBe('Low liquidity');
    expect(SCORING_FACTOR_LABELS.SIGNAL_NO_PAIRS).toBe('No trading pairs');
    expect(SCORING_FACTOR_LABELS.SIGNAL_CONCENTRATED_HOLDERS).toBe(
      'Concentrated holders',
    );
    expect(SCORING_FACTOR_LABELS.SIGNAL_EXTREME_PRICE_CHANGE).toBe(
      'Extreme price change',
    );
    expect(SCORING_FACTOR_LABELS.SIGNAL_MICROCAP).toBe('Micro-cap');
    expect(SCORING_FACTOR_LABELS.SIGNAL_NO_MARKET_DATA).toBe('No market data');
  });
});
