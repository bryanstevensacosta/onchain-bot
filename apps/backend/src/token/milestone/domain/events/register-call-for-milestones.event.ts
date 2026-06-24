import { DomainEvent } from 'shared/kernel/domain-event';

export interface RegisterCallForMilestonesPayload {
  callId: string;
  chain: string;
  address: string;
  mcAtCall: number;
  publishedAt: string;
}

export class RegisterCallForMilestonesEvent extends DomainEvent {
  public static readonly EVENT_NAME = 'milestone.register.call';

  public readonly payload: RegisterCallForMilestonesPayload;

  constructor(aggregateId: string, payload: RegisterCallForMilestonesPayload) {
    super(RegisterCallForMilestonesEvent.EVENT_NAME, aggregateId);
    this.payload = Object.freeze({ ...payload });
  }

  toPayload(): Record<string, unknown> {
    return { ...this.payload };
  }
}
