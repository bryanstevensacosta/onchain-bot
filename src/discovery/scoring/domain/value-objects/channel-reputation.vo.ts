import { ValueObject } from 'shared/kernel/value-object';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

interface ChannelReputationProps {
  readonly channelId: string;
  readonly score: number; // 0..1
  readonly mentionCount: number;
}

/**
 * Per-channel reputation (how trustworthy is this source).
 *
 * `score` 0..1:
 * - 0.9+ : well-known, accurate (e.g., "SpyDefi")
 * - 0.5  : default for unknown channels
 * - 0.1  : known spammer / unreliable
 *
 * `mentionCount` is the historical total mentions tracked by the system.
 */
export class ChannelReputation extends ValueObject<ChannelReputationProps> {
  protected constructor(props: ChannelReputationProps) {
    super(props);
  }

  public static create(input: {
    channelId: string;
    score: number;
    mentionCount?: number;
  }): ChannelReputation {
    if (!input.channelId) {
      throw new DomainError(ErrorCode.VALIDATION, `channelId cannot be empty`);
    }
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > 1) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        `Channel reputation score must be 0..1, got ${input.score}`,
        { score: input.score },
      );
    }
    return new ChannelReputation({
      channelId: input.channelId,
      score: input.score,
      mentionCount: input.mentionCount ?? 0,
    });
  }

  public static unknown(channelId: string): ChannelReputation {
    return new ChannelReputation({ channelId, score: 0.5, mentionCount: 0 });
  }

  public get channelId(): string {
    return this.props.channelId;
  }
  public get score(): number {
    return this.props.score;
  }
  public get mentionCount(): number {
    return this.props.mentionCount;
  }

  public isTrusted(): boolean {
    return this.props.score >= 0.7;
  }

  public isSuspicious(): boolean {
    return this.props.score <= 0.3;
  }
}
