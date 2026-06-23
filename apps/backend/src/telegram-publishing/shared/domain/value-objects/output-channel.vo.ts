import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface OutputChannelProps {
  readonly channelId: string;
  readonly username: string | null;
  readonly tier: 'PRIMARY' | 'SECONDARY' | 'PREMIUM';
}

export class OutputChannel extends ValueObject<OutputChannelProps> {
  private static readonly PATTERN = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

  protected constructor(props: OutputChannelProps) {
    super(props);
  }

  public static create(input: {
    channelId: string;
    username?: string | null;
    tier?: 'PRIMARY' | 'SECONDARY' | 'PREMIUM';
  }): OutputChannel {
    if (!OutputChannel.PATTERN.test(input.channelId)) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Invalid output channel id: ${input.channelId}`,
        { channelId: input.channelId },
      );
    }
    return new OutputChannel({
      channelId: input.channelId,
      username: input.username ?? null,
      tier: input.tier ?? 'PRIMARY',
    });
  }

  public get channelId(): string {
    return this.props.channelId;
  }
  public get username(): string | null {
    return this.props.username;
  }
  public get tier(): 'PRIMARY' | 'SECONDARY' | 'PREMIUM' {
    return this.props.tier;
  }

  public shouldPublish(score: number): boolean {
    if (this.props.tier === 'PRIMARY') return true;
    if (this.props.tier === 'SECONDARY') return score >= 70;
    return score >= 80;
  }
}