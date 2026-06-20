import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted when a chain-detection probing completes. Consumed by
 * enrichment, classification, and downstream BCs.
 */
export class ChainDetectedEvent extends DomainEvent {
  public readonly payload: {
    readonly address: string;
    readonly resolvedChain: string;
    readonly confidence: number;
    readonly isContract: boolean | null;
    readonly scores: ReadonlyArray<{
      readonly chain: string;
      readonly points: number;
      readonly reasons: ReadonlyArray<string>;
    }>;
    readonly detectedAt: Date;
  };

  constructor(payload: {
    address: string;
    resolvedChain: string;
    confidence: number;
    isContract: boolean | null;
    scores: ReadonlyArray<{
      chain: string;
      points: number;
      reasons: ReadonlyArray<string>;
    }>;
    detectedAt: Date;
  }) {
    super('chain-detection.chain.detected', payload.address);
    this.payload = Object.freeze({
      ...payload,
      scores: payload.scores.map((s) => ({
        chain: s.chain,
        points: s.points,
        reasons: Object.freeze([...s.reasons]),
      })),
    });
  }

  public toPayload(): Record<string, unknown> {
    return {
      address: this.payload.address,
      resolvedChain: this.payload.resolvedChain,
      confidence: this.payload.confidence,
      isContract: this.payload.isContract,
      scores: this.payload.scores.map((s) => ({ ...s })),
      detectedAt: this.payload.detectedAt.toISOString(),
    };
  }
}
