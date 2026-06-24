import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export type SignalType =
  | 'LOW_LIQUIDITY'
  | 'NO_HOLDERS'
  | 'LOW_HOLDERS'
  | 'NO_PAIRS'
  | 'CONCENTRATED_HOLDERS'
  | 'EXTREME_PRICE_CHANGE'
  | 'MICROCAP'
  | 'NO_NAME'
  | 'NO_MARKET_DATA'
  | 'POSSIBLE_RUG';

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface RiskSignalProps {
  readonly type: SignalType;
  readonly severity: Severity;
  readonly description: string;
}

/**
 * A specific reason why a token is risky (or not).
 *
 * Examples:
 * - { type: 'LOW_LIQUIDITY', severity: 'HIGH', description: 'Liquidity $500 < $1,000 threshold' }
 * - { type: 'NO_HOLDERS', severity: 'HIGH', description: '0 holders reported' }
 */
export class RiskSignal extends ValueObject<RiskSignalProps> {
  private static readonly VALID_TYPES = new Set<SignalType>([
    'LOW_LIQUIDITY',
    'NO_HOLDERS',
    'LOW_HOLDERS',
    'NO_PAIRS',
    'CONCENTRATED_HOLDERS',
    'EXTREME_PRICE_CHANGE',
    'MICROCAP',
    'NO_NAME',
    'NO_MARKET_DATA',
    'POSSIBLE_RUG',
  ]);

  private static readonly VALID_SEVERITIES = new Set<Severity>([
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL',
  ]);

  protected constructor(props: RiskSignalProps) {
    super(props);
  }

  public static create(input: {
    type: SignalType;
    severity: Severity;
    description: string;
  }): RiskSignal {
    if (!RiskSignal.VALID_TYPES.has(input.type)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid signal type: ${input.type}`,
      );
    }
    if (!RiskSignal.VALID_SEVERITIES.has(input.severity)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid severity: ${input.severity}`,
      );
    }
    if (!input.description.trim()) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Signal description cannot be empty`,
      );
    }
    return new RiskSignal({ ...input });
  }

  public get type(): SignalType {
    return this.props.type;
  }
  public get severity(): Severity {
    return this.props.severity;
  }
  public get description(): string {
    return this.props.description;
  }

  public isCritical(): boolean {
    return this.props.severity === 'CRITICAL';
  }

  public weight(): number {
    switch (this.props.severity) {
      case 'CRITICAL':
        return 40;
      case 'HIGH':
        return 20;
      case 'MEDIUM':
        return 10;
      case 'LOW':
        return 3;
    }
  }
}
