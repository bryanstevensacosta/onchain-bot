import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted by the parsing BC after a TokenCall is successfully parsed
 * from a Telegram message. Consumed by normalization, chain-detection,
 * and downstream BCs.
 */
export class CallParsedEvent extends DomainEvent {
  public readonly payload: {
    readonly kolId: string;
    readonly messageId: number;
    readonly occurredAt: Date;
    readonly contractAddress: string;
    readonly contractChainHint: string;
    readonly ticker: string | null;
    readonly name: string | null;
    readonly marketCapUsd: number | null;
    readonly liquidityUsd: number | null;
    readonly fdvUsd: number | null;
    readonly holders: number | null;
    readonly chart: string | null;
    readonly confidence: number;
  };

  constructor(payload: {
    kolId: string;
    messageId: number;
    occurredAt: Date;
    contractAddress: string;
    contractChainHint: string;
    ticker: string | null;
    name: string | null;
    marketCapUsd: number | null;
    liquidityUsd: number | null;
    fdvUsd: number | null;
    holders: number | null;
    chart: string | null;
    confidence: number;
  }) {
    super('parsing.call.parsed', `${payload.kolId}:${payload.messageId}`);
    this.payload = Object.freeze(payload);
  }

  public toPayload(): Record<string, unknown> {
    return {
      ...this.payload,
      occurredAt: this.payload.occurredAt.toISOString(),
    };
  }
}
