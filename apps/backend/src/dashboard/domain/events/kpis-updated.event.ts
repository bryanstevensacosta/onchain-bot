import { DomainEvent } from 'shared/kernel/domain-event';

export class KpisUpdatedEvent extends DomainEvent {
  public static readonly EVENT_NAME = 'dashboard.kpis.updated';

  public readonly payload: { updatedAt: string };

  constructor(aggregateId: string = 'dashboard') {
    super(KpisUpdatedEvent.EVENT_NAME, aggregateId);
    this.payload = Object.freeze({ updatedAt: new Date().toISOString() });
  }

  toPayload(): Record<string, unknown> {
    return { ...this.payload };
  }
}
