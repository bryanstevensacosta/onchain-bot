import { ValueObject } from 'shared/kernel/value-object';

export type FilterReasonCode =
  | 'SCORE_TOO_LOW'
  | 'CLASSIFICATION_BLOCKED'
  | 'BLACKLISTED'
  | 'HONEYPOT_SUSPECTED'
  | 'RISK_WEIGHT_EXCEEDED'
  | 'INSUFFICIENT_DATA'
  | 'CHAIN_UNSUPPORTED';

interface FilterReasonProps {
  readonly code: FilterReasonCode;
  readonly message: string;
}

/**
 * Reason a token failed (or passed with caveats) a filter.
 *
 * Examples:
 * - { code: 'SCORE_TOO_LOW', message: 'Score 35 < 50 threshold' }
 * - { code: 'BLACKLISTED', message: 'Address in known-scam list' }
 */
export class FilterReason extends ValueObject<FilterReasonProps> {
  private static readonly VALID_CODES = new Set<FilterReasonCode>([
    'SCORE_TOO_LOW',
    'CLASSIFICATION_BLOCKED',
    'BLACKLISTED',
    'HONEYPOT_SUSPECTED',
    'RISK_WEIGHT_EXCEEDED',
    'INSUFFICIENT_DATA',
    'CHAIN_UNSUPPORTED',
  ]);

  protected constructor(props: FilterReasonProps) {
    super(props);
  }

  public static create(input: {
    code: FilterReasonCode;
    message: string;
  }): FilterReason {
    if (!FilterReason.VALID_CODES.has(input.code)) {
      throw new Error(`Invalid filter reason code: ${input.code}`);
    }
    if (!input.message.trim()) {
      throw new Error('Filter reason message cannot be empty');
    }
    return new FilterReason({ ...input });
  }

  public get code(): FilterReasonCode {
    return this.props.code;
  }
  public get message(): string {
    return this.props.message;
  }
}
