import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted by the scoring BC when a TokenScore is computed.
 * Consumed by filters and publishing BCs.
 *
 * N11: removed `breakdown` from payload.
 * N14: added `securityFlag` (SCAM | SUSPICIOUS | LEGITIMATE | UNKNOWN) to
 * payload. The scoring BC needs it to apply the security cap without
 * re-fetching the classification.
 */
export class TokenScoredEvent extends DomainEvent {
  public readonly payload: {
    readonly chain: string;
    readonly address: string;
    readonly score: number;
    readonly tier: string;
    readonly classification: string;
    readonly securityFlag: string;
    readonly sourceCount: number;
    readonly mentionCount: number;
    readonly avgKolReputation: number;
    readonly scoredAt: Date;
  };

  constructor(payload: {
    chain: string;
    address: string;
    score: number;
    tier: string;
    classification: string;
    securityFlag: string;
    sourceCount: number;
    mentionCount: number;
    avgKolReputation: number;
    scoredAt: Date;
  }) {
    super('scoring.token.scored', `${payload.chain}:${payload.address}`);
    this.payload = Object.freeze({ ...payload });
  }

  public toPayload(): Record<string, unknown> {
    return {
      ...this.payload,
      scoredAt: this.payload.scoredAt.toISOString(),
    };
  }
}
