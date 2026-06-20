import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export type HoneypotSignalType =
  | 'HIGH_BUY_TAX'
  | 'HIGH_SELL_TAX'
  | 'HIGH_TRANSFER_TAX'
  | 'CANNOT_SELL'
  | 'CANNOT_BUY'
  | 'OWNER_CAN_DRAIN'
  | 'OWNER_NOT_RENOUNCED'
  | 'SELF_DESTRUCT_RISK'
  | 'PROXY_PATTERN'
  | 'BLACKLIST_FUNCTION'
  | 'WHITELIST_ONLY'
  | 'HONEYPOT_FLAG';

export type HoneypotSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface HoneypotSignalProps {
  readonly type: HoneypotSignalType;
  readonly severity: HoneypotSeverity;
  readonly description: string;
}

/**
 * A specific honeypot indicator detected during analysis.
 *
 * Similar to RiskSignal in classification BC but specifically for
 * on-chain contract-level threats.
 */
export class HoneypotSignal extends ValueObject<HoneypotSignalProps> {
  private static readonly VALID_TYPES = new Set<HoneypotSignalType>([
    'HIGH_BUY_TAX',
    'HIGH_SELL_TAX',
    'HIGH_TRANSFER_TAX',
    'CANNOT_SELL',
    'CANNOT_BUY',
    'OWNER_CAN_DRAIN',
    'OWNER_NOT_RENOUNCED',
    'SELF_DESTRUCT_RISK',
    'PROXY_PATTERN',
    'BLACKLIST_FUNCTION',
    'WHITELIST_ONLY',
    'HONEYPOT_FLAG',
  ]);

  private static readonly VALID_SEVERITIES = new Set<HoneypotSeverity>([
    'INFO',
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL',
  ]);

  protected constructor(props: HoneypotSignalProps) {
    super(props);
  }

  public static create(input: {
    type: HoneypotSignalType;
    severity: HoneypotSeverity;
    description: string;
  }): HoneypotSignal {
    if (!HoneypotSignal.VALID_TYPES.has(input.type)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid signal type: ${input.type}`,
      );
    }
    if (!HoneypotSignal.VALID_SEVERITIES.has(input.severity)) {
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
    return new HoneypotSignal({ ...input });
  }

  public get type(): HoneypotSignalType {
    return this.props.type;
  }
  public get severity(): HoneypotSeverity {
    return this.props.severity;
  }
  public get description(): string {
    return this.props.description;
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
      case 'INFO':
        return 0;
    }
  }
}
