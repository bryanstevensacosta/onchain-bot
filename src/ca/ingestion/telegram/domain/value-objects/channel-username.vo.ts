import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface ChannelUsernameProps {
  readonly value: string;
}

/**
 * Telegram channel username (e.g. "SpyDefi" from t.me/SpyDefi).
 * Must be 5-32 chars, alphanumeric + underscores.
 */
export class ChannelUsername extends ValueObject<ChannelUsernameProps> {
  private static readonly PATTERN = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

  protected constructor(props: ChannelUsernameProps) {
    super(props);
  }

  public static fromString(raw: string): ChannelUsername {
    const normalized = raw
      .trim()
      .replace(/^@/, '')
      .replace(/^https?:\/\/t\.me\//, '');
    if (!ChannelUsername.PATTERN.test(normalized)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid channel username: ${raw}`,
        { raw },
      );
    }
    return new ChannelUsername({ value: normalized });
  }

  public get value(): string {
    return this.props.value;
  }
}
