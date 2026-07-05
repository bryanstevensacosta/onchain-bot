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
 *
 * `media` carries the list of downloaded photo attachments (Telegram
 * `msg.media.photo` items persisted with their on-disk filePath). It is
 * always populated (defaults to `[]`) so consumers can iterate without
 * nullish checks; messages without photos just have an empty array.
 */
import { CryptoNewsMedia } from 'telegram/ingestion/crypto-news/domain/value-objects/crypto-news-media.vo';

export interface CryptoNewsMessageProps {
  readonly id: string;
  readonly channelId: string;
  readonly messageId: number;
  readonly title: string | null;
  readonly content: string;
  readonly publishedAt: Date;
  readonly ingestedAt: Date;
  readonly media?: ReadonlyArray<CryptoNewsMedia>;
  readonly linkPreviewUrl: string | null;
  readonly linkPreviewTitle: string | null;
  readonly linkPreviewDescription: string | null;
  readonly linkPreviewSiteName: string | null;
  readonly formattingEntities: string | null;
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
    media?: ReadonlyArray<CryptoNewsMedia>;
    linkPreviewUrl?: string | null;
    linkPreviewTitle?: string | null;
    linkPreviewDescription?: string | null;
    linkPreviewSiteName?: string | null;
    formattingEntities?: string | null;
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
      media: input.media ?? [],
      linkPreviewUrl: input.linkPreviewUrl ?? null,
      linkPreviewTitle: input.linkPreviewTitle ?? null,
      linkPreviewDescription: input.linkPreviewDescription ?? null,
      linkPreviewSiteName: input.linkPreviewSiteName ?? null,
      formattingEntities: input.formattingEntities ?? null,
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

  public get media(): ReadonlyArray<CryptoNewsMedia> {
    return this.props.media ?? [];
  }

  public get linkPreviewUrl(): string | null {
    return this.props.linkPreviewUrl ?? null;
  }

  public get linkPreviewTitle(): string | null {
    return this.props.linkPreviewTitle ?? null;
  }

  public get linkPreviewDescription(): string | null {
    return this.props.linkPreviewDescription ?? null;
  }

  public get linkPreviewSiteName(): string | null {
    return this.props.linkPreviewSiteName ?? null;
  }

  public get formattingEntities(): string | null {
    return this.props.formattingEntities ?? null;
  }
}
