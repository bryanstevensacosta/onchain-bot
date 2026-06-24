import { ValueObject } from 'shared/kernel/value-object';
import { SourceType } from 'kol/source/domain/value-objects/source-type.vo';

interface SourceProps {
  readonly kolId: string;
  readonly sourceType: SourceType;
  readonly username: string | null;
  readonly messageIds: ReadonlyArray<number>;
}

/**
 * A KOL that mentioned the token, with the list of message ids where
 * the token was referenced.
 *
 * Same KOL appearing in multiple mentions adds to `messageIds`
 * (deduplicated).
 *
 * Fase 3 of the kol-refactor plan: this VO moved out of
 * `token/normalization/` so the KOL/source concept has a single owner.
 * The field `kolId` was `channelId` in the old version.
 */
export class Source extends ValueObject<SourceProps> {
  protected constructor(props: SourceProps) {
    super(props);
  }

  public static firstMention(
    kolId: string,
    messageId: number,
    username: string | null,
    sourceType: SourceType = 'TELEGRAM',
  ): Source {
    return new Source({
      kolId,
      username,
      messageIds: [messageId],
      sourceType,
    });
  }

  public addMessage(messageId: number): Source {
    if (this.props.messageIds.includes(messageId)) {
      return this;
    }
    return new Source({
      kolId: this.props.kolId,
      sourceType: this.props.sourceType,
      username: this.props.username,
      messageIds: [...this.props.messageIds, messageId],
    });
  }

  public get kolId(): string {
    return this.props.kolId;
  }

  public get sourceType(): SourceType {
    return this.props.sourceType;
  }

  public get username(): string | null {
    return this.props.username;
  }

  public get messageIds(): ReadonlyArray<number> {
    return this.props.messageIds;
  }

  public get mentionCount(): number {
    return this.props.messageIds.length;
  }
}
