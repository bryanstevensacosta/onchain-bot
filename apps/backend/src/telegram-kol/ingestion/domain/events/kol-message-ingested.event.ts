import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted when a Telegram message has been ingested from a monitored KOL channel.
 *
 * Consumed by the extraction BC (downstream pipeline).
 *
 * Per fix-1 (Bot Dev ToS §4.3 compliance): the `text` field is NO LONGER
 * included in this event. The raw text flows only through direct method
 * calls between ingestion and extraction, never through the event bus.
 *
 * Fase 4 of the kol-refactor plan: promoted from the staging file to
 * the canonical event. Wire `eventName` stays `telegram.message.ingested`
 * for backward compat with any handler bound by string.
 */
export class KolMessageIngestedEvent extends DomainEvent {
  public readonly payload: {
    readonly kolId: string;
    readonly handle: string | null;
    readonly messageId: number;
    readonly occurredAt: Date;
  };

  constructor(payload: {
    kolId: string;
    handle: string | null;
    messageId: number;
    occurredAt: Date;
  }) {
    super('telegram.message.ingested', `${payload.kolId}:${payload.messageId}`);
    this.payload = Object.freeze(payload);
  }

  public toPayload(): Record<string, unknown> {
    return {
      kolId: this.payload.kolId,
      handle: this.payload.handle,
      messageId: this.payload.messageId,
      occurredAt: this.payload.occurredAt.toISOString(),
    };
  }
}
