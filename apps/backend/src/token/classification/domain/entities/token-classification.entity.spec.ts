import { TokenClassification } from 'token/classification/domain/entities/token-classification.entity';
import { RiskSignal } from 'token/classification/domain/value-objects/risk-signal.vo';
import { ChainId } from 'chain/identity/chain-id.vo';

const EVM = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

function build(
  overrides: {
    signals?: RiskSignal[];
    completeness?: number;
  } = {},
): TokenClassification {
  return TokenClassification.create({
    chain: ChainId.ETHEREUM,
    address: EVM,
    classification: 'TOKEN' as never,
    securityFlag: 'LEGITIMATE' as never,
    signals: overrides.signals ?? [],
    snapshotCompleteness: overrides.completeness ?? 1,
  });
}

describe('TokenClassification', () => {
  it('riskWeight sums signal weights', () => {
    const c = build({
      signals: [
        RiskSignal.create({
          type: 'LOW_LIQUIDITY',
          severity: 'HIGH',
          description: 'x',
        }),
        RiskSignal.create({
          type: 'NO_HOLDERS',
          severity: 'HIGH',
          description: 'y',
        }),
        RiskSignal.create({
          type: 'NO_NAME',
          severity: 'LOW',
          description: 'z',
        }),
      ],
    });
    expect(c.riskWeight()).toBe(20 + 20 + 3);
  });

  it('highestSeverity picks the worst', () => {
    const c = build({
      signals: [
        RiskSignal.create({
          type: 'NO_NAME',
          severity: 'LOW',
          description: 'x',
        }),
        RiskSignal.create({
          type: 'NO_HOLDERS',
          severity: 'HIGH',
          description: 'y',
        }),
        RiskSignal.create({
          type: 'EXTREME_PRICE_CHANGE',
          severity: 'MEDIUM',
          description: 'z',
        }),
      ],
    });
    expect(c.highestSeverity()).toBe('HIGH');
  });

  it('highestSeverity null when no signals', () => {
    expect(build().highestSeverity()).toBeNull();
  });

  it('hasSignal returns true if any signal matches', () => {
    const c = build({
      signals: [
        RiskSignal.create({
          type: 'LOW_LIQUIDITY',
          severity: 'HIGH',
          description: 'x',
        }),
      ],
    });
    expect(c.hasSignal('LOW_LIQUIDITY')).toBe(true);
    expect(c.hasSignal('NO_HOLDERS')).toBe(false);
  });

  it('throws on invalid completeness', () => {
    expect(() => build({ completeness: 2 })).toThrow();
  });

  it('throws on empty address', () => {
    expect(() =>
      TokenClassification.create({
        chain: ChainId.ETHEREUM,
        address: '',
        classification: 'TOKEN' as never,
        signals: [],
        snapshotCompleteness: 1,
      }),
    ).toThrow();
  });

  it('emitClassified publishes TokenClassifiedEvent', () => {
    const c = build();
    c.emitClassified();
    const events = c.commit();
    expect(events).toHaveLength(1);
    expect(events[0].eventName).toBe('classification.token.classified');
  });
});
