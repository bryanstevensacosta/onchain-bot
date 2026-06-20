import { HoneypotSignal } from 'ca/honeypot/domain/value-objects/honeypot-signal.vo';
import { HoneypotRisk } from 'ca/honeypot/domain/value-objects/honeypot-risk.vo';
import { computeRisk } from 'ca/honeypot/domain/entities/honeypot-analysis.entity';

describe('HoneypotRisk', () => {
  it('SAFE has weight 0', () => {
    expect(HoneypotRisk.SAFE.weight()).toBe(0);
  });

  it('CRITICAL has weight 40 and isDangerous', () => {
    expect(HoneypotRisk.CRITICAL.weight()).toBe(40);
    expect(HoneypotRisk.CRITICAL.isDangerous()).toBe(true);
  });

  it('LOW and MEDIUM are not dangerous', () => {
    expect(HoneypotRisk.LOW.isDangerous()).toBe(false);
    expect(HoneypotRisk.MEDIUM.isDangerous()).toBe(false);
  });

  it('fromString parses valid values', () => {
    expect(HoneypotRisk.fromString('SAFE').value).toBe('SAFE');
    expect(HoneypotRisk.fromString('critical').value).toBe('CRITICAL');
  });

  it('fromString throws on invalid', () => {
    expect(() => HoneypotRisk.fromString('XYZ')).toThrow();
  });
});

describe('HoneypotSignal', () => {
  it('creates with valid input', () => {
    const s = HoneypotSignal.create({
      type: 'HIGH_SELL_TAX',
      severity: 'HIGH',
      description: 'x',
    });
    expect(s.weight()).toBe(20);
  });

  it('CRITICAL signal weight 40', () => {
    expect(
      HoneypotSignal.create({
        type: 'HONEYPOT_FLAG',
        severity: 'CRITICAL',
        description: 'x',
      }).weight(),
    ).toBe(40);
  });

  it('INFO signal weight 0', () => {
    expect(
      HoneypotSignal.create({
        type: 'BLACKLIST_FUNCTION',
        severity: 'INFO',
        description: 'x',
      }).weight(),
    ).toBe(0);
  });

  it('rejects invalid type', () => {
    expect(() =>
      HoneypotSignal.create({
        type: 'INVALID' as never,
        severity: 'LOW',
        description: 'x',
      }),
    ).toThrow();
  });

  it('rejects invalid severity', () => {
    expect(() =>
      HoneypotSignal.create({
        type: 'HIGH_SELL_TAX',
        severity: 'WRONG' as never,
        description: 'x',
      }),
    ).toThrow();
  });

  it('rejects empty description', () => {
    expect(() =>
      HoneypotSignal.create({
        type: 'HIGH_SELL_TAX',
        severity: 'LOW',
        description: '',
      }),
    ).toThrow();
  });
});

describe('computeRisk (from HoneypotAnalysis)', () => {
  it('SAFE with no signals', () => {
    expect(computeRisk([]).value).toBe('SAFE');
  });

  it('CRITICAL when any CRITICAL signal present', () => {
    const sigs = [
      HoneypotSignal.create({
        type: 'HONEYPOT_FLAG',
        severity: 'CRITICAL',
        description: 'x',
      }),
    ];
    expect(computeRisk(sigs).value).toBe('CRITICAL');
  });

  it('HIGH when 1+ HIGH signal', () => {
    const sigs = [
      HoneypotSignal.create({
        type: 'HIGH_SELL_TAX',
        severity: 'HIGH',
        description: 'x',
      }),
    ];
    expect(computeRisk(sigs).value).toBe('HIGH');
  });

  it('HIGH when 2+ MEDIUM + 1+ LOW', () => {
    const sigs = [
      HoneypotSignal.create({
        type: 'HIGH_BUY_TAX',
        severity: 'MEDIUM',
        description: 'x',
      }),
      HoneypotSignal.create({
        type: 'HIGH_TRANSFER_TAX',
        severity: 'MEDIUM',
        description: 'y',
      }),
      HoneypotSignal.create({
        type: 'BLACKLIST_FUNCTION',
        severity: 'LOW',
        description: 'z',
      }),
    ];
    expect(computeRisk(sigs).value).toBe('HIGH');
  });

  it('MEDIUM when 1 MEDIUM signal', () => {
    const sigs = [
      HoneypotSignal.create({
        type: 'HIGH_BUY_TAX',
        severity: 'MEDIUM',
        description: 'x',
      }),
    ];
    expect(computeRisk(sigs).value).toBe('MEDIUM');
  });

  it('MEDIUM when 3+ LOW signals', () => {
    const sigs = Array.from({ length: 3 }, () =>
      HoneypotSignal.create({
        type: 'BLACKLIST_FUNCTION',
        severity: 'LOW',
        description: 'x',
      }),
    );
    expect(computeRisk(sigs).value).toBe('MEDIUM');
  });

  it('LOW when 1-2 LOW signals', () => {
    const sigs = [
      HoneypotSignal.create({
        type: 'BLACKLIST_FUNCTION',
        severity: 'LOW',
        description: 'x',
      }),
    ];
    expect(computeRisk(sigs).value).toBe('LOW');
  });

  it('INFO signals are ignored', () => {
    const sigs = [
      HoneypotSignal.create({
        type: 'BLACKLIST_FUNCTION',
        severity: 'INFO',
        description: 'x',
      }),
    ];
    expect(computeRisk(sigs).value).toBe('SAFE');
  });
});
