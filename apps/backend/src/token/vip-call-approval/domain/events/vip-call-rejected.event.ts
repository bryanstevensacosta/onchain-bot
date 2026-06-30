import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted when a token fails one or more filters.
 * Consumed by ops/dashboards for monitoring; NOT published to users.
 */
export class VipCallRejectedEvent extends DomainEvent {
  public readonly payload: {
    readonly chain: string;
    readonly address: string;
    readonly score: number;
    readonly classification: string;
    readonly reasons: ReadonlyArray<{
      readonly code: string;
      readonly message: string;
    }>;
    readonly decidedAt: Date;
  };

  constructor(payload: {
    chain: string;
    address: string;
    score: number;
    classification: string;
    reasons: ReadonlyArray<{ code: string; message: string }>;
    decidedAt: Date;
  }) {
    super('vip-call.approval.rejected', `${payload.chain}:${payload.address}`);
    this.payload = Object.freeze({
      ...payload,
      reasons: Object.freeze([...payload.reasons]),
    });
  }

  public toPayload(): Record<string, unknown> {
    return {
      ...this.payload,
      decidedAt: this.payload.decidedAt.toISOString(),
    };
  }
}
