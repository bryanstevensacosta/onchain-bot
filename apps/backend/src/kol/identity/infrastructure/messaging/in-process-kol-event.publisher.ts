import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from 'shared/kernel/domain-event';
import { KolEventPublisher } from 'kol/identity/application/ports/kol-event.publisher';

@Injectable()
export class InProcessKolEventPublisher extends KolEventPublisher {
  private readonly logger = new Logger(InProcessKolEventPublisher.name);

  constructor(private readonly eventEmitter: EventEmitter2) {
    super();
  }

  public async publish(event: DomainEvent): Promise<void> {
    this.logger.debug(
      this.constructor.name,
      event.eventName,
      event.aggregateId,
    );
    this.eventEmitter.emit(event.eventName, event);
  }
}
