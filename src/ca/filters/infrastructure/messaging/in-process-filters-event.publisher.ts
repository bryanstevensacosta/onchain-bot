import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from 'shared/kernel/domain-event';
import { FiltersEventPublisher } from 'ca/filters/application/ports/filters-event.publisher';

@Injectable()
export class InProcessFiltersEventPublisher extends FiltersEventPublisher {
  private readonly logger = new Logger(InProcessFiltersEventPublisher.name);

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
