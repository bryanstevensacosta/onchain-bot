import { DomainEvent } from '../../../shared/kernel/domain-event';
import type { ScoreBreakdownItem } from '../entities/scored-call.entity';

export interface CallScoredPayload {
  readonly mentionId: string;
  readonly kolId: string;
  readonly messageId: number;
  readonly chain: string;
  readonly address: string;
  readonly score: number;
  readonly tier: string;
  readonly avgKolReputation: number;
  readonly breakdown: ReadonlyArray<ScoreBreakdownItem>;
  readonly scoredAt: Date;
}

/**
 * Emitted once per scored mention that PASSED all gates.
 *
 * Returned directly by `ScoreTokenUseCase` — kol-system wires no event bus
 * at this stage, so there is no publisher on the way out (fix-1, direct
 * call, same pattern as extraction/parsing/normalization). Below-cut
 * mentions emit nothing (discarded pre-publisher).
 */
export class CallScoredEvent extends DomainEvent {
  public readonly payload: CallScoredPayload;

  public constructor(payload: CallScoredPayload) {
    super('scoring.token.scored', payload.mentionId);
    this.payload = Object.freeze({ ...payload });
  }

  public toPayload(): Record<string, unknown> {
    return {
      ...this.payload,
      scoredAt: this.payload.scoredAt.toISOString(),
    };
  }
}
