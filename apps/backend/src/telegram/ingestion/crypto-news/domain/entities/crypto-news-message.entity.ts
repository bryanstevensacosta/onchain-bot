/**
 * Plain TS record representing a single ingested crypto-news message.
 *
 * NOT an aggregate root — these are immutable records persisted to
 * the `crypto_news_messages` table. No invariants to enforce; no events
 * emitted from here (the source aggregate emits events).
 *
 * The raw `content` field is stored as-is (no extraction/parsing applied
 * — news content is opaque to the alpha pipeline). Note: this is the
 * STORED shape, distinct from any domain event payload (which is metadata
 * only per fix-1 ToS compliance).
 */
export interface CryptoNewsMessageProps {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly title: string | null;
  readonly content: string;
  readonly publishedAt: Date;
  readonly ingestedAt: Date;
}

export class CryptoNewsMessage {
  protected constructor(private readonly props: CryptoNewsMessageProps) {}

  public static create(input: {
    channelId: string;
    messageId: number;
    title: string | null;
    content: string;
    publishedAt: Date;
    ingestedAt?: Date;
  }): CryptoNewsMessage {
    if (!input.channelId?.trim()) {
      throw new Error('CryptoNewsMessage channelId cannot be empty');
    }
    if (!Number.isFinite(input.messageId) || input.messageId < 0) {
      throw new Error(
        'CryptoNewsMessage messageId must be a non-negative number',
      );
    }
    if (input.content === null || input.content === undefined) {
      throw new Error('CryptoNewsMessage content cannot be null/undefined');
    }
    return new CryptoNewsMessage({
      id: crypto.randomUUID(),
      channelId: input.channelId,
      messageId: input.messageId,
      title: input.title?.trim() || null,
      content: input.content,
      publishedAt: input.publishedAt,
      ingestedAt: input.ingestedAt ?? new Date(),
    });
  }

  /**
   * Rehydrate a message from persistence without validation. For hydration
   * use ONLY.
   */
  public static reconstitute(props: CryptoNewsMessageProps): CryptoNewsMessage {
    return new CryptoNewsMessage(props);
  }

  public get id(): string {
    return this.props.id;
  }

  public get channelId(): string {
    return this.props.channelId;
  }

  public get messageId(): number {
    return this.props.messageId;
  }

  public get title(): string | null {
    return this.props.title;
  }

  public get content(): string {
    return this.props.content;
  }

  public get publishedAt(): Date {
    return this.props.publishedAt;
  }

  public get ingestedAt(): Date {
    return this.props.ingestedAt;
  }
}
