import { DomainEvent } from '../../../shared/kernel/domain-event';
import type {
  ApprovalStatus,
  DecidedBy,
} from '../entities/call-approval.entity';

export interface CallApprovalDecidedPayload {
  readonly approvalId: string;
  readonly templateId: string;
  readonly mentionId: string;
  readonly status: ApprovalStatus;
  readonly decidedBy: DecidedBy;
  readonly reason: string | null;
}

/**
 * Emitted once per decided approval (approved or rejected).
 *
 * Returned directly by `EvaluateApprovalUseCase` (fix-1, direct call, no
 * bus) and by the manual approve/reject paths. Pending rows emit nothing.
 */
export class CallApprovalDecidedEvent extends DomainEvent {
  public readonly payload: CallApprovalDecidedPayload;

  public constructor(payload: CallApprovalDecidedPayload) {
    super('approval.call.decided', payload.approvalId);
    this.payload = Object.freeze({ ...payload });
  }

  public toPayload(): Record<string, unknown> {
    return { ...this.payload };
  }
}
