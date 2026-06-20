import { ValueObject } from 'shared/kernel/value-object';

export type FilterVerdictValue = 'APPROVED' | 'REJECTED' | 'PENDING';

interface FilterVerdictProps {
  readonly value: FilterVerdictValue;
}

/**
 * Final decision of the filters pipeline:
 * - APPROVED: token passed all gates, ready to publish
 * - REJECTED: token failed at least one gate, do not publish
 * - PENDING: awaiting async check (e.g., on-chain honeypot simulation)
 */
export class FilterVerdict extends ValueObject<FilterVerdictProps> {
  public static readonly APPROVED = new FilterVerdict({ value: 'APPROVED' });
  public static readonly REJECTED = new FilterVerdict({ value: 'REJECTED' });
  public static readonly PENDING = new FilterVerdict({ value: 'PENDING' });

  private static readonly VALID = new Set<FilterVerdictValue>([
    'APPROVED',
    'REJECTED',
    'PENDING',
  ]);

  protected constructor(props: FilterVerdictProps) {
    super(props);
  }

  public static fromString(raw: string): FilterVerdict {
    const value = raw.toUpperCase() as FilterVerdictValue;
    if (!FilterVerdict.VALID.has(value)) {
      throw new Error(`Invalid filter verdict: ${raw}`);
    }
    return new FilterVerdict({ value });
  }

  public get value(): FilterVerdictValue {
    return this.props.value;
  }

  public isApproved(): boolean {
    return this.props.value === 'APPROVED';
  }
}
