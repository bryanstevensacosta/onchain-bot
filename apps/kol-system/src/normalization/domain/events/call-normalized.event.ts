import { DomainEvent } from '../../../shared/kernel/domain-event';

export interface CallNormalizedPayload {
  readonly mentionId: string;
  readonly chain: string;
  readonly address: string;
  readonly ticker: string | null;
  readonly name: string | null;
  readonly chart: string | null;
  readonly kolId: string;
  readonly handle: string | null;
  readonly channelId: string | null;
  readonly messageId: number;
  readonly contractIndex: number;
  readonly occurredAt: Date;
}

/**
 * Emitted once per normalized mention (P1: one event per row).
 *
 * Returned directly by `NormalizeCallUseCase` — kol-system wires no event
 * bus at this stage, so there is no publisher on the way out (fix-1,
 * direct call, same pattern as extraction/parsing).
 */
export class CallNormalizedEvent extends DomainEvent {
  public readonly payload: CallNormalizedPayload;

  public constructor(payload: CallNormalizedPayload) {
    super('normalization.call.normalized', payload.mentionId);
    this.payload = Object.freeze({ ...payload });
  }

  public toPayload(): Record<string, unknown> {
    return {
      ...this.payload,
      occurredAt: this.payload.occurredAt.toISOString(),
    };
  }
}
