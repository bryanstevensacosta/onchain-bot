import { ValueObject } from 'shared/kernel/value-object';

export type VipCallApprovalReasonCode =
  | 'SCORE_TOO_LOW'
  | 'CLASSIFICATION_BLOCKED'
  | 'BLACKLISTED'
  | 'HONEYPOT_SUSPECTED'
  | 'RISK_WEIGHT_EXCEEDED'
  | 'INSUFFICIENT_DATA'
  | 'CHAIN_UNSUPPORTED';

interface VipCallApprovalReasonProps {
  readonly code: VipCallApprovalReasonCode;
  readonly message: string;
}

/**
 * Reason a token failed (or passed with caveats) a filter.
 *
 * Examples:
 * - { code: 'SCORE_TOO_LOW', message: 'Score 35 < 50 threshold' }
 * - { code: 'BLACKLISTED', message: 'Address in known-scam list' }
 */
export class VipCallApprovalReason extends ValueObject<VipCallApprovalReasonProps> {
  private static readonly RETRYABLE_CODES = new Set<VipCallApprovalReasonCode>([
    'SCORE_TOO_LOW',
    'HONEYPOT_SUSPECTED',
    'INSUFFICIENT_DATA',
    'RISK_WEIGHT_EXCEEDED',
  ]);

  public static isRetryable(code: string): boolean {
    return VipCallApprovalReason.RETRYABLE_CODES.has(code as VipCallApprovalReasonCode);
  }
  private static readonly VALID_CODES = new Set<VipCallApprovalReasonCode>([
    'SCORE_TOO_LOW',
    'CLASSIFICATION_BLOCKED',
    'BLACKLISTED',
    'HONEYPOT_SUSPECTED',
    'RISK_WEIGHT_EXCEEDED',
    'INSUFFICIENT_DATA',
    'CHAIN_UNSUPPORTED',
  ]);

  protected constructor(props: VipCallApprovalReasonProps) {
    super(props);
  }

  public static create(input: {
    code: VipCallApprovalReasonCode;
    message: string;
  }): VipCallApprovalReason {
    if (!VipCallApprovalReason.VALID_CODES.has(input.code)) {
      throw new Error(`Invalid filter reason code: ${input.code}`);
    }
    if (!input.message.trim()) {
      throw new Error('Filter reason message cannot be empty');
    }
    return new VipCallApprovalReason({ ...input });
  }

  public get code(): VipCallApprovalReasonCode {
    return this.props.code;
  }
  public get message(): string {
    return this.props.message;
  }
}
