import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from 'shared/kernel/domain-event';
import { EnrichmentEventPublisher } from '../../application/ports/enrichment-event.publisher';

@Injectable()
export class InProcessEnrichmentEventPublisher extends EnrichmentEventPublisher {
  private readonly logger = new Logger(InProcessEnrichmentEventPublisher.name);

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
