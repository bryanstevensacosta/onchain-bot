import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted when a queued crypto-news article is successfully published
 * to the output Telegram channel.
 *
 * Carries the minimum metadata needed by downstream consumers
 * (dashboard, analytics): which channel, which source message, the
 * Telegram-side message id, and the publish timestamp.
 *
 * Per fix-1 (Bot Dev ToS §4.3): the raw `content` field of the source
 * message is NEVER included in this event. Downstream observers that
 * need the body should query the crypto-news repository.
 */
export class ArticlePublishedEvent extends DomainEvent {
  public readonly payload: {
    readonly channelId: string;
    readonly messageId: number;
    readonly telegramMessageId: string;
    readonly publishedAt: Date;
  };

  constructor(payload: {
    channelId: string;
    messageId: number;
    telegramMessageId: string;
    publishedAt: Date;
  }) {
    super(
      'crypto-news-publisher.article.published',
      `${payload.channelId}:${payload.messageId}`,
    );
    this.payload = Object.freeze({ ...payload });
  }

  public toPayload(): Record<string, unknown> {
    return {
      channelId: this.payload.channelId,
      messageId: this.payload.messageId,
      telegramMessageId: this.payload.telegramMessageId,
      publishedAt: this.payload.publishedAt.toISOString(),
    };
  }
}
