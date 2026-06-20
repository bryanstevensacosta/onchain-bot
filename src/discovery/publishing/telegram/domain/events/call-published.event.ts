import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted when an approved call was successfully published to at least
 * one output channel. Consumed by analytics/dashboards.
 */
export class CallPublishedEvent extends DomainEvent {
  public readonly payload: {
    readonly chain: string;
    readonly address: string;
    readonly ticker: string | null;
    readonly score: number;
    readonly tier: string;
    readonly classification: string;
    readonly publishedChannelIds: ReadonlyArray<string>;
    readonly publishedAt: Date;
  };

  constructor(payload: {
    chain: string;
    address: string;
    ticker: string | null;
    readonly score: number;
    readonly tier: string;
    readonly classification: string;
    readonly publishedChannelIds: ReadonlyArray<string>;
    publishedAt: Date;
  }) {
    super(
      'publishing.telegram.published',
      `${payload.chain}:${payload.address}`,
    );
    this.payload = Object.freeze({
      ...payload,
      publishedChannelIds: Object.freeze([...payload.publishedChannelIds]),
    });
  }

  public toPayload(): Record<string, unknown> {
    return {
      ...this.payload,
      publishedAt: this.payload.publishedAt.toISOString(),
    };
  }
}
