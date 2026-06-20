import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from 'shared/kernel/domain-event';
import { ExtractionEventPublisher } from 'ca/extraction/application/ports/extraction-event.publisher';

/**
 * In-process event publisher.
 *
 * Emits via NestJS EventEmitter2 so subscribers in other BCs can listen
 * with @OnEvent. For multi-process deployments, replace with a Redis/Kafka
 * adapter that publishes to a broker.
 */
@Injectable()
export class InProcessExtractionEventPublisher extends ExtractionEventPublisher {
  private readonly logger = new Logger(InProcessExtractionEventPublisher.name);

  public constructor(private readonly eventEmitter: EventEmitter2) {
    super();
  }

  public async publish(event: DomainEvent): Promise<void> {
    this.logger.debug(
      `event=${event.eventName} aggregateId=${event.aggregateId}`,
    );
    await Promise.resolve(this.eventEmitter.emit(event.eventName, event));
  }
}
