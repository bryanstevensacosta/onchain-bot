import { DomainEvent } from 'shared/kernel/domain-event';

export interface RegisterCallForAchievementsPayload {
  callId: string;
  chain: string;
  address: string;
  mcAtCall: number;
  publishedAt: string;
}

export class RegisterCallForAchievementsEvent extends DomainEvent {
  public static readonly EVENT_NAME = 'achievement.register.call';

  public readonly payload: RegisterCallForAchievementsPayload;

  constructor(aggregateId: string, payload: RegisterCallForAchievementsPayload) {
    super(RegisterCallForAchievementsEvent.EVENT_NAME, aggregateId);
    this.payload = Object.freeze({ ...payload });
  }

  toPayload(): Record<string, unknown> {
    return { ...this.payload };
  }
}
