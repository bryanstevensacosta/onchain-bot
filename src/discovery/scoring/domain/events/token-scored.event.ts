import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted by the scoring BC when a TokenScore is computed.
 * Consumed by filters and publishing BCs.
 */
export class TokenScoredEvent extends DomainEvent {
  public readonly payload: {
    readonly chain: string;
    readonly address: string;
    readonly score: number;
    readonly tier: string;
    readonly classification: string;
    readonly sourceCount: number;
    readonly mentionCount: number;
    readonly avgChannelReputation: number;
    readonly breakdown: ReadonlyArray<{
      readonly factor: string;
      readonly delta: number;
      readonly note: string;
    }>;
    readonly scoredAt: Date;
  };

  constructor(payload: {
    chain: string;
    address: string;
    score: number;
    tier: string;
    classification: string;
    sourceCount: number;
    mentionCount: number;
    avgChannelReputation: number;
    breakdown: ReadonlyArray<{ factor: string; delta: number; note: string }>;
    scoredAt: Date;
  }) {
    super('scoring.token.scored', `${payload.chain}:${payload.address}`);
    this.payload = Object.freeze({
      ...payload,
      breakdown: Object.freeze([...payload.breakdown]),
    });
  }

  public toPayload(): Record<string, unknown> {
    return {
      ...this.payload,
      scoredAt: this.payload.scoredAt.toISOString(),
    };
  }
}
