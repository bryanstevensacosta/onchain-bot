import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface ChannelIdProps {
  readonly value: string; // Telegram peer id as string
}

/**
 * Telegram channel peer id (BigInt serialized to string).
 */
export class ChannelId extends ValueObject<ChannelIdProps> {
  private static readonly PATTERN = /^-?\d+$/;

  protected constructor(props: ChannelIdProps) {
    super(props);
  }

  public static fromString(raw: string): ChannelId {
    if (!ChannelId.PATTERN.test(raw)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid channel id: ${raw}`,
        { raw },
      );
    }
    return new ChannelId({ value: raw });
  }

  public get value(): string {
    return this.props.value;
  }
}
