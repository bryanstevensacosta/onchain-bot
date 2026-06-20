import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Outbound port: publish extraction-domain events to downstream BCs.
 *
 * Implemented in infrastructure/messaging (in-process, Redis, Kafka, etc.)
 */
export abstract class ExtractionEventPublisher {
  public abstract publish(event: DomainEvent): Promise<void>;

  public async publishAll(events: ReadonlyArray<DomainEvent>): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
