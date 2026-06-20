import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

export type OutcomeValue = 'STRONG' | 'GOOD' | 'NEUTRAL' | 'POOR' | 'FAILED';

interface OutcomeProps {
  readonly value: OutcomeValue;
}

/**
 * How a token call from a channel turned out (in retrospect).
 *
 * Determined by comparing post-call market data:
 * - STRONG: ATH > 5x MC at call time
 * - GOOD:   ATH > 2x MC
 * - NEUTRAL: between 0.5x and 2x
 * - POOR:   < 0.5x (called too late / rug pull)
 * - FAILED: contract is honeypot, rugged, or liquidity drained
 */
export class Outcome extends ValueObject<OutcomeProps> {
  public static readonly STRONG = new Outcome({ value: 'STRONG' });
  public static readonly GOOD = new Outcome({ value: 'GOOD' });
  public static readonly NEUTRAL = new Outcome({ value: 'NEUTRAL' });
  public static readonly POOR = new Outcome({ value: 'POOR' });
  public static readonly FAILED = new Outcome({ value: 'FAILED' });

  private static readonly VALID = new Set<OutcomeValue>([
    'STRONG',
    'GOOD',
    'NEUTRAL',
    'POOR',
    'FAILED',
  ]);

  protected constructor(props: OutcomeProps) {
    super(props);
  }

  public static fromString(raw: string): Outcome {
    const value = raw.toUpperCase() as OutcomeValue;
    if (!Outcome.VALID.has(value)) {
      throw new DomainError(ErrorCode.VALIDATION, `Invalid outcome: ${raw}`, {
        raw,
      });
    }
    return new Outcome({ value });
  }

  public get value(): OutcomeValue {
    return this.props.value;
  }

  public weight(): number {
    switch (this.props.value) {
      case 'STRONG':
        return 1.0;
      case 'GOOD':
        return 0.5;
      case 'NEUTRAL':
        return 0;
      case 'POOR':
        return -0.3;
      case 'FAILED':
        return -0.8;
    }
  }
}
