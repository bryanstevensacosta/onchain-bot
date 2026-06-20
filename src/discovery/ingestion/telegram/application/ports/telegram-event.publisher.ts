import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Outbound port: publish domain events to downstream consumers.
 *
 * Implemented in infrastructure/messaging (in-process EventBus, Redis, Kafka, etc.)
 */
export abstract class TelegramEventPublisher {
  public abstract publish(event: DomainEvent): Promise<void>;

  public async publishAll(events: ReadonlyArray<DomainEvent>): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
