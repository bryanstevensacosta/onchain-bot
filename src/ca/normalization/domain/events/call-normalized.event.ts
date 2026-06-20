import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted by the normalization BC when a CanonicalTokenCall is created
 * or merged with a new mention. Consumed by chain-detection, enrichment,
 * classification, and downstream BCs.
 */
export class CallNormalizedEvent extends DomainEvent {
  public readonly payload: {
    readonly chain: string;
    readonly address: string;
    readonly ticker: string | null;
    readonly name: string | null;
    readonly chart: string | null;
    readonly marketCapUsd: number | null;
    readonly liquidityUsd: number | null;
    readonly fdvUsd: number | null;
    readonly holders: number | null;
    readonly sourceCount: number;
    readonly mentionCount: number;
    readonly firstSeenAt: Date;
    readonly lastSeenAt: Date;
    readonly confidence: number;
  };

  constructor(payload: {
    chain: string;
    address: string;
    ticker: string | null;
    name: string | null;
    chart: string | null;
    marketCapUsd: number | null;
    liquidityUsd: number | null;
    fdvUsd: number | null;
    holders: number | null;
    sourceCount: number;
    mentionCount: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    confidence: number;
  }) {
    super(
      'normalization.call.normalized',
      `${payload.chain}:${payload.address}`,
    );
    this.payload = Object.freeze({
      ...payload,
      firstSeenAt: payload.firstSeenAt,
      lastSeenAt: payload.lastSeenAt,
    });
  }

  public toPayload(): Record<string, unknown> {
    return {
      ...this.payload,
      firstSeenAt: this.payload.firstSeenAt.toISOString(),
      lastSeenAt: this.payload.lastSeenAt.toISOString(),
    };
  }
}
