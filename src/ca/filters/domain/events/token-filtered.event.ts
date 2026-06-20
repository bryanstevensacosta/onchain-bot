import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted when a token passes all filters and is ready to publish.
 * Consumed by the publishing BC.
 */
export class TokenFilteredEvent extends DomainEvent {
  public readonly payload: {
    readonly chain: string;
    readonly address: string;
    readonly score: number;
    readonly classification: string;
    readonly decidedAt: Date;
  };

  constructor(payload: {
    chain: string;
    address: string;
    score: number;
    classification: string;
    decidedAt: Date;
  }) {
    super('filters.token.approved', `${payload.chain}:${payload.address}`);
    this.payload = Object.freeze(payload);
  }

  public toPayload(): Record<string, unknown> {
    return {
      ...this.payload,
      decidedAt: this.payload.decidedAt.toISOString(),
    };
  }
}
