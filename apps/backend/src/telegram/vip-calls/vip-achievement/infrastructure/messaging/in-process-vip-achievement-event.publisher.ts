import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from 'shared/kernel/domain-event';
import { DomainEventPublisher } from 'shared/common/ports/domain-event.publisher';

/**
 * BC-scoped, in-process publisher for events that originate inside
 * `vip-achievement` (e.g. `VipAchievementPublishedEvent` once a milestone
 * message is posted). Mirrors the shape of
 * `shared/common/messaging/in-process-domain-event.publisher.ts` but is
 * owned by this BC so that:
 *
 *   - other BCs cannot accidentally import `InProcessDomainEventPublisher`
 *     directly to bind to a vip-achievement port, and
 *   - tests can swap a fake publisher for this concrete class without
 *     affecting the shared kernel.
 *
 * For multi-process deployments, replace with a Redis/Kafka adapter that
 * publishes to an external broker and keep the {@link DomainEventPublisher}
 * contract unchanged.
 */
@Injectable()
export class InProcessVipAchievementEventPublisher extends DomainEventPublisher {
  private readonly logger = new Logger(
    InProcessVipAchievementEventPublisher.name,
  );

  public constructor(private readonly eventEmitter: EventEmitter2) {
    super();
  }

  public async publish(event: DomainEvent): Promise<void> {
    this.logger.debug(
      `event=${event.eventName} aggregateId=${event.aggregateId}`,
    );
    this.eventEmitter.emit(event.eventName, event);
  }
}
