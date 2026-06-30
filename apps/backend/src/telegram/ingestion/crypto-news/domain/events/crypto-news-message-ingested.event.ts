import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted when a Telegram message has been ingested from a monitored
 * crypto-news source channel and persisted to `crypto_news_messages`.
 *
 * Per fix-1 (Bot Dev ToS §4.3 compliance): the `content`/`text` field
 * is NOT included in this event. The raw content is stored in the DB
 * but does not cross the event bus. Only metadata flows via events.
 *
 * Consumers (dashboard, analytics) can query the repository for full
 * content if needed.
 */
export class CryptoNewsMessageIngestedEvent extends DomainEvent {
  public readonly payload: {
    readonly channelId: string;
    readonly messageId: number;
    readonly title: string | null;
    readonly occurredAt: Date;
  };

  constructor(payload: {
    channelId: string;
    messageId: number;
    title: string | null;
    occurredAt: Date;
  }) {
    super(
      'crypto-news.message.ingested',
      `${payload.channelId}:${payload.messageId}`,
    );
    this.payload = Object.freeze(payload);
  }

  public toPayload(): Record<string, unknown> {
    return {
      channelId: this.payload.channelId,
      messageId: this.payload.messageId,
      title: this.payload.title,
      occurredAt: this.payload.occurredAt.toISOString(),
    };
  }
}
