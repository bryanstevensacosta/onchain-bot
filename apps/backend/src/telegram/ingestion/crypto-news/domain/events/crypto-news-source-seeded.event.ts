import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted when a new crypto-news Telegram source has been registered.
 *
 * Observability-only: triggers dashboard refresh, no business side effects.
 */
export class CryptoNewsSourceSeededEvent extends DomainEvent {
  public readonly payload: {
    readonly channelId: string;
    readonly title: string;
    readonly handle: string | null;
  };

  constructor(payload: {
    channelId: string;
    title: string;
    handle: string | null;
  }) {
    super('crypto-news.source.seeded', payload.channelId);
    this.payload = Object.freeze(payload);
  }

  public toPayload(): Record<string, unknown> {
    return {
      channelId: this.payload.channelId,
      title: this.payload.title,
      handle: this.payload.handle,
    };
  }
}
