import { ValueObject } from 'shared/kernel/value-object';

export type PublishStatusValue = 'PUBLISHED' | 'FAILED' | 'SKIPPED';

interface PublishStatusProps {
  readonly value: PublishStatusValue;
}

export class PublishStatus extends ValueObject<PublishStatusProps> {
  public static readonly PUBLISHED = new PublishStatus({ value: 'PUBLISHED' });
  public static readonly FAILED = new PublishStatus({ value: 'FAILED' });
  public static readonly SKIPPED = new PublishStatus({ value: 'SKIPPED' });

  private static readonly VALID = new Set<PublishStatusValue>([
    'PUBLISHED',
    'FAILED',
    'SKIPPED',
  ]);

  protected constructor(props: PublishStatusProps) {
    super(props);
  }

  public static fromString(raw: string): PublishStatus {
    const value = raw.toUpperCase() as PublishStatusValue;
    if (!PublishStatus.VALID.has(value)) {
      throw new Error(`Invalid publish status: ${raw}`);
    }
    return new PublishStatus({ value });
  }

  public get value(): PublishStatusValue {
    return this.props.value;
  }
}