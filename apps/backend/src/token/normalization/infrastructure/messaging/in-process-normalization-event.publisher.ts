import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from 'shared/kernel/domain-event';
import { NormalizationEventPublisher } from 'token/normalization/application/ports/normalization-event.publisher';

@Injectable()
export class InProcessNormalizationEventPublisher extends NormalizationEventPublisher {
  private readonly logger = new Logger(
    InProcessNormalizationEventPublisher.name,
  );

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
