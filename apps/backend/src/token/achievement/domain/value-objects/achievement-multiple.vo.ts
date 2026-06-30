import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { ValueObject } from 'shared/kernel/value-object';

export interface AchievementMultipleProps {
  value: number;
}

export class AchievementMultiple extends ValueObject<AchievementMultipleProps> {
  private constructor(props: AchievementMultipleProps) {
    super(props);
  }

  static fromNumber(value: number): AchievementMultiple {
    if (!Number.isFinite(value) || value <= 1) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `AchievementMultiple must be a finite number greater than 1 (received: ${value})`,
      );
    }
    return new AchievementMultiple({ value });
  }

  get value(): number {
    return this.props.value;
  }
}
