import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Outbound port: publishing of crypto-news domain events.
 *
 * Implemented in infrastructure/messaging (in-process via EventEmitter2).
 */
export abstract class CryptoNewsEventPublisher {
  public abstract publish(event: DomainEvent): Promise<void>;
  public async publishAll(events: ReadonlyArray<DomainEvent>): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
