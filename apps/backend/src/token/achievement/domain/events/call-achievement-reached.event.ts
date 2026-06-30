import { DomainEvent } from 'shared/kernel/domain-event';

export interface CallAchievementReachedPayload {
  callId: string;
  chain: string;
  address: string;
  multiple: number;
  mcAtCall: number;
  mcNow: number;
  notifiedAt: string;
}

export class CallAchievementReachedEvent extends DomainEvent {
  public static readonly EVENT_NAME = 'achievement.call.reached';

  public readonly payload: CallAchievementReachedPayload;

  constructor(aggregateId: string, payload: CallAchievementReachedPayload) {
    super(CallAchievementReachedEvent.EVENT_NAME, aggregateId);
    this.payload = Object.freeze({ ...payload });
  }

  toPayload(): Record<string, unknown> {
    return { ...this.payload };
  }
}
