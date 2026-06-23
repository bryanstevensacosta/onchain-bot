import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted when honeypot analysis completes for a token.
 * Consumed by classification BC to upgrade signals, and by publishing
 * BC to reject dangerous tokens.
 */
export class HoneypotDetectedEvent extends DomainEvent {
  public readonly payload: {
    readonly chain: string;
    readonly address: string;
    readonly risk: string;
    readonly signals: ReadonlyArray<{
      readonly type: string;
      readonly severity: string;
      readonly description: string;
    }>;
    readonly buyTax: number | null;
    readonly sellTax: number | null;
    readonly transferTax: number | null;
    readonly canSell: boolean | null;
    readonly canBuy: boolean | null;
    readonly ownerCanDrain: boolean | null;
    readonly ownerRenounced: boolean | null;
    readonly isProxy: boolean | null;
    readonly analysisSource: 'SIMULATION' | 'STATIC' | 'HEURISTIC';
    readonly analyzedAt: Date;
  };

  constructor(payload: {
    chain: string;
    address: string;
    risk: string;
    signals: ReadonlyArray<{
      type: string;
      severity: string;
      description: string;
    }>;
    buyTax: number | null;
    sellTax: number | null;
    transferTax: number | null;
    canSell: boolean | null;
    canBuy: boolean | null;
    ownerCanDrain: boolean | null;
    ownerRenounced: boolean | null;
    isProxy: boolean | null;
    analysisSource: 'SIMULATION' | 'STATIC' | 'HEURISTIC';
    analyzedAt: Date;
  }) {
    super('honeypot.analysis.completed', `${payload.chain}:${payload.address}`);
    this.payload = Object.freeze({
      ...payload,
      signals: Object.freeze([...payload.signals]),
    });
  }

  public toPayload(): Record<string, unknown> {
    return {
      ...this.payload,
      analyzedAt: this.payload.analyzedAt.toISOString(),
    };
  }
}
