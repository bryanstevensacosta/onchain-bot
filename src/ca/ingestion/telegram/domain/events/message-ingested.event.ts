import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted when a Telegram message has been ingested from a monitored channel.
 *
 * Consumed by the extraction BC (downstream pipeline).
 *
 * The `text` field is optional: the channel start-listening lifecycle event
 * publishes a metadata-only event (no text); per-message events carry the raw
 * text payload. Extraction handlers skip events with missing text.
 */
export class MessageIngestedEvent extends DomainEvent {
  public readonly payload: {
    readonly channelId: string;
    readonly username: string | null;
    readonly messageId: number;
    readonly occurredAt: Date;
    readonly text?: string;
  };

  constructor(payload: {
    channelId: string;
    username: string | null;
    messageId: number;
    occurredAt: Date;
    text?: string;
  }) {
    super(
      'telegram.message.ingested',
      `${payload.channelId}:${payload.messageId}`,
    );
    this.payload = Object.freeze(payload);
  }

  public toPayload(): Record<string, unknown> {
    return {
      channelId: this.payload.channelId,
      username: this.payload.username,
      messageId: this.payload.messageId,
      occurredAt: this.payload.occurredAt.toISOString(),
      text: this.payload.text,
    };
  }
}
