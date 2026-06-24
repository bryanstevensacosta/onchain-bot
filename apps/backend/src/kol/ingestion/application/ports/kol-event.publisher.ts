import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Outbound port: publish KOL domain events to downstream consumers.
 *
 * Implemented in infrastructure/messaging (in-process EventBus, Redis, Kafka, etc.)
 *
 * Fase 4 of the kol-refactor plan: renamed from `TelegramEventPublisher`.
 */
export abstract class KolEventPublisher {
  public abstract publish(event: DomainEvent): Promise<void>;

  public async publishAll(events: ReadonlyArray<DomainEvent>): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
