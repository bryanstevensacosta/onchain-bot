import { DomainEvent } from 'shared/kernel/domain-event';

export abstract class KolEventPublisher {
  public abstract publish(event: DomainEvent): Promise<void>;
  public async publishAll(events: ReadonlyArray<DomainEvent>): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
