import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted when ALL configured providers failed to return data for a token.
 * Consumed by classification BC to mark the token as low-confidence.
 */
export class EnrichmentFailedEvent extends DomainEvent {
  public readonly payload: {
    readonly chain: string;
    readonly address: string;
    readonly errors: ReadonlyArray<{
      readonly provider: string;
      readonly message: string;
    }>;
    readonly failedAt: Date;
  };

  constructor(payload: {
    chain: string;
    address: string;
    errors: ReadonlyArray<{ provider: string; message: string }>;
    failedAt: Date;
  }) {
    super('enrichment.token.failed', `${payload.chain}:${payload.address}`);
    this.payload = Object.freeze({
      ...payload,
      errors: Object.freeze([...payload.errors]),
    });
  }

  public toPayload(): Record<string, unknown> {
    return {
      chain: this.payload.chain,
      address: this.payload.address,
      errors: [...this.payload.errors],
      failedAt: this.payload.failedAt.toISOString(),
    };
  }
}
