import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export type HoneypotRiskLevel = 'SAFE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

interface HoneypotRiskProps {
  readonly value: HoneypotRiskLevel;
}

/**
 * Overall risk assessment from honeypot analysis.
 *
 * - SAFE:     No red flags detected
 * - LOW:      1 minor warning (e.g., 5-10% sell tax)
 * - MEDIUM:   Multiple warnings OR 1 moderate issue
 * - HIGH:     1 critical issue OR multiple moderate
 * - CRITICAL: Likely honeypot — recommend rejecting
 */
export class HoneypotRisk extends ValueObject<HoneypotRiskProps> {
  public static readonly SAFE = new HoneypotRisk({ value: 'SAFE' });
  public static readonly LOW = new HoneypotRisk({ value: 'LOW' });
  public static readonly MEDIUM = new HoneypotRisk({ value: 'MEDIUM' });
  public static readonly HIGH = new HoneypotRisk({ value: 'HIGH' });
  public static readonly CRITICAL = new HoneypotRisk({ value: 'CRITICAL' });

  private static readonly VALID = new Set<HoneypotRiskLevel>([
    'SAFE',
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL',
  ]);

  protected constructor(props: HoneypotRiskProps) {
    super(props);
  }

  public static fromString(raw: string): HoneypotRisk {
    const value = raw.toUpperCase() as HoneypotRiskLevel;
    if (!HoneypotRisk.VALID.has(value)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid honeypot risk: ${raw}`,
        { raw },
      );
    }
    return new HoneypotRisk({ value });
  }

  public get value(): HoneypotRiskLevel {
    return this.props.value;
  }

  public weight(): number {
    switch (this.props.value) {
      case 'SAFE':
        return 0;
      case 'LOW':
        return 3;
      case 'MEDIUM':
        return 10;
      case 'HIGH':
        return 20;
      case 'CRITICAL':
        return 40;
    }
  }

  public isDangerous(): boolean {
    return this.props.value === 'HIGH' || this.props.value === 'CRITICAL';
  }
}
