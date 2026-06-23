import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from 'shared/kernel/domain-event';
import { ParsingEventPublisher } from 'token/intake/parsing/application/ports/parsing-event.publisher';

/**
 * In-process event publisher. Emits via NestJS EventEmitter2 so cross-BC
 * subscribers can listen with @OnEvent. Replace with Redis/Kafka for
 * multi-process deployments.
 */
@Injectable()
export class InProcessParsingEventPublisher extends ParsingEventPublisher {
  private readonly logger = new Logger(InProcessParsingEventPublisher.name);

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
