import { ValueObject } from 'shared/kernel/value-object';

interface SourceProps {
  readonly channelId: string;
  readonly username: string | null;
  readonly messageIds: ReadonlyArray<number>;
}

/**
 * A Telegram channel that mentioned the token, with the list of message
 * ids where the token was referenced.
 *
 * Same channel appearing in multiple mentions adds to `messageIds`
 * (deduplicated).
 */
export class Source extends ValueObject<SourceProps> {
  protected constructor(props: SourceProps) {
    super(props);
  }

  public static firstMention(
    channelId: string,
    messageId: number,
    username: string | null,
  ): Source {
    return new Source({ channelId, username, messageIds: [messageId] });
  }

  public addMessage(messageId: number): Source {
    if (this.props.messageIds.includes(messageId)) {
      return this;
    }
    return new Source({
      channelId: this.props.channelId,
      username: this.props.username,
      messageIds: [...this.props.messageIds, messageId],
    });
  }

  public get channelId(): string {
    return this.props.channelId;
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
