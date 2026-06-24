import { DomainEvent } from 'shared/kernel/domain-event';

export interface CallMilestoneReachedPayload {
  callId: string;
  chain: string;
  address: string;
  multiple: number;
  mcAtCall: number;
  mcNow: number;
  notifiedAt: string;
}

export class CallMilestoneReachedEvent extends DomainEvent {
  public static readonly EVENT_NAME = 'milestone.call.reached';

  public readonly payload: CallMilestoneReachedPayload;

  constructor(aggregateId: string, payload: CallMilestoneReachedPayload) {
    super(CallMilestoneReachedEvent.EVENT_NAME, aggregateId);
    this.payload = Object.freeze({ ...payload });
  }

  toPayload(): Record<string, unknown> {
    return { ...this.payload };
  }
}
