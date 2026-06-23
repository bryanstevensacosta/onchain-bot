import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export type SecurityFlagValue =
  | 'SCAM'
  | 'SUSPICIOUS'
  | 'LEGITIMATE'
  | 'UNKNOWN';

interface SecurityFlagProps {
  readonly value: SecurityFlagValue;
}

/**
 * Security assessment of a token/address, independent of its TYPE.
 *
 * N14: separated from `Classification` (which now only holds address TYPE:
 * TOKEN | POOL | ROUTER | NFT | UNKNOWN). A token can be `TOKEN` + `SCAM`,
 * or `POOL` + `LEGITIMATE`, etc.
 *
 * Mapping:
 * - SCAM:        flagged as fraud (heuristic or known-scammer list)
 * - SUSPICIOUS:  has risk signals but no conclusive evidence
 * - LEGITIMATE:  no risk signals
 * - UNKNOWN:     not enough data to assess
 */
export class SecurityFlag extends ValueObject<SecurityFlagProps> {
  public static readonly SCAM = new SecurityFlag({ value: 'SCAM' });
  public static readonly SUSPICIOUS = new SecurityFlag({ value: 'SUSPICIOUS' });
  public static readonly LEGITIMATE = new SecurityFlag({ value: 'LEGITIMATE' });
  public static readonly UNKNOWN = new SecurityFlag({ value: 'UNKNOWN' });

  private static readonly VALID = new Set<SecurityFlagValue>([
    'SCAM',
    'SUSPICIOUS',
    'LEGITIMATE',
    'UNKNOWN',
  ]);

  protected constructor(props: SecurityFlagProps) {
    super(props);
  }

  public static fromString(raw: string): SecurityFlag {
    const value = raw.toUpperCase() as SecurityFlagValue;
    if (!SecurityFlag.VALID.has(value)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid security flag: ${raw}`,
        { raw },
      );
    }
    return new SecurityFlag({ value });
  }

  public get value(): SecurityFlagValue {
    return this.props.value;
  }

  public isScam(): boolean {
    return this.props.value === 'SCAM';
  }

  public isSafe(): boolean {
    return this.props.value === 'LEGITIMATE';
  }
}
