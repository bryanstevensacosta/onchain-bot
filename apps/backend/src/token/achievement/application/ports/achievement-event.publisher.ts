import { DomainEvent } from 'shared/kernel/domain-event';

export abstract class AchievementEventPublisher {
  abstract publish(event: DomainEvent): Promise<void>;
  abstract publishAll(events: ReadonlyArray<DomainEvent>): Promise<void>;
}
