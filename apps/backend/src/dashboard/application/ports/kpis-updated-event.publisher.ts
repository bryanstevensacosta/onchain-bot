import { DomainEvent } from 'shared/kernel/domain-event';

export abstract class KpisUpdatedEventPublisher {
  public abstract publish(event: DomainEvent): Promise<void>;
}
