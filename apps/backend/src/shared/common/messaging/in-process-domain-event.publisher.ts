import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from '../../kernel/domain-event';
import { DomainEventPublisher } from '../ports/domain-event.publisher';

/**
 * In-process implementation of DomainEventPublisher using NestJS
 * EventEmitter2. Emits via the framework's event bus so subscribers in
 * any BC can listen with `@OnEvent`.
 *
 * For multi-process deployments, replace with a Redis/Kafka adapter that
 * publishes to an external broker.
 */
@Injectable()
export class InProcessDomainEventPublisher extends DomainEventPublisher {
  private readonly logger = new Logger(InProcessDomainEventPublisher.name);

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
