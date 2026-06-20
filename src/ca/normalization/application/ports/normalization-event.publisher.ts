import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Outbound port: publish normalization-domain events to downstream BCs.
 */
export abstract class NormalizationEventPublisher {
  public abstract publish(event: DomainEvent): Promise<void>;

  public async publishAll(events: ReadonlyArray<DomainEvent>): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
