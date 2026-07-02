import { DomainEvent } from '../../kernel/domain-event';

/**
 * Outbound port: publishing of domain events to downstream BCs.
 *
 * Concrete implementations live in `shared/common/messaging/` (in-process
 * via EventEmitter2 today; Redis/Kafka in future multi-process deployments).
 *
 * Per-BC publishers (e.g. `KolEventPublisher`, `PublishingEventPublisher`)
 * extend this class as thin aliases so existing DI tokens, mocks, and
 * type imports keep working unchanged.
 */
export abstract class DomainEventPublisher {
  public abstract publish(event: DomainEvent): Promise<void>;

  public async publishAll(events: ReadonlyArray<DomainEvent>): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
