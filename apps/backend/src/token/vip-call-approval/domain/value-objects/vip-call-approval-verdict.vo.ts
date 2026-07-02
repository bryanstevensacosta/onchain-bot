import { ValueObject } from 'shared/kernel/value-object';

export type VipCallApprovalVerdictValue = 'APPROVED' | 'REJECTED' | 'PENDING';

interface VipCallApprovalVerdictProps {
  readonly value: VipCallApprovalVerdictValue;
}

/**
 * Final decision of the filters pipeline:
 * - APPROVED: token passed all gates, ready to publish
 * - REJECTED: token failed at least one gate, do not publish
 * - PENDING: awaiting async check (e.g., on-chain honeypot simulation)
 */
export class VipCallApprovalVerdict extends ValueObject<VipCallApprovalVerdictProps> {
  public static readonly APPROVED = new VipCallApprovalVerdict({
    value: 'APPROVED',
  });
  public static readonly REJECTED = new VipCallApprovalVerdict({
    value: 'REJECTED',
  });
  public static readonly PENDING = new VipCallApprovalVerdict({
    value: 'PENDING',
  });

  private static readonly VALID = new Set<VipCallApprovalVerdictValue>([
    'APPROVED',
    'REJECTED',
    'PENDING',
  ]);

  protected constructor(props: VipCallApprovalVerdictProps) {
    super(props);
  }

  public static fromString(raw: string): VipCallApprovalVerdict {
    const value = raw.toUpperCase() as VipCallApprovalVerdictValue;
    if (!VipCallApprovalVerdict.VALID.has(value)) {
      throw new Error(`Invalid filter verdict: ${raw}`);
    }
    return new VipCallApprovalVerdict({ value });
  }

  public get value(): VipCallApprovalVerdictValue {
    return this.props.value;
  }

  public isApproved(): boolean {
    return this.props.value === 'APPROVED';
  }
}
