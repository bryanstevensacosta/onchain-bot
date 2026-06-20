import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted by the classification BC when a TokenClassification is
 * created. Consumed by scoring, filters, and downstream BCs.
 */
export class TokenClassifiedEvent extends DomainEvent {
  public readonly payload: {
    readonly chain: string;
    readonly address: string;
    readonly classification: string;
    readonly confidence: number;
    readonly signals: ReadonlyArray<{
      readonly type: string;
      readonly severity: string;
      readonly description: string;
    }>;
    readonly riskWeight: number;
    readonly snapshotCompleteness: number;
    readonly classifiedAt: Date;
  };

  constructor(payload: {
    chain: string;
    address: string;
    classification: string;
    confidence: number;
    signals: ReadonlyArray<{
      type: string;
      severity: string;
      description: string;
    }>;
    riskWeight: number;
    snapshotCompleteness: number;
    classifiedAt: Date;
  }) {
    super(
      'classification.token.classified',
      `${payload.chain}:${payload.address}`,
    );
    this.payload = Object.freeze({
      ...payload,
      signals: Object.freeze([...payload.signals]),
    });
  }

  public toPayload(): Record<string, unknown> {
    return {
      ...this.payload,
      classifiedAt: this.payload.classifiedAt.toISOString(),
    };
  }
}
