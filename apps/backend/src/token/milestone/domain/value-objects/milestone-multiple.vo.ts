import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ValueObject } from 'shared/kernel/value-object';

export interface MilestoneMultipleProps {
  value: number;
}

export class MilestoneMultiple extends ValueObject<MilestoneMultipleProps> {
  private constructor(props: MilestoneMultipleProps) {
    super(props);
  }

  static fromNumber(value: number): MilestoneMultiple {
    if (!Number.isFinite(value) || value <= 1) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `MilestoneMultiple must be a finite number greater than 1 (received: ${value})`,
      );
    }
    return new MilestoneMultiple({ value });
  }

  get value(): number {
    return this.props.value;
  }
}
