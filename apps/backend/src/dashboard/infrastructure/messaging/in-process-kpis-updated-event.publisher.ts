import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from 'shared/kernel/domain-event';
import { KpisUpdatedEventPublisher } from '../../application/ports/kpis-updated-event.publisher';

@Injectable()
export class InProcessKpisUpdatedEventPublisher extends KpisUpdatedEventPublisher {
  public constructor(private readonly eventEmitter: EventEmitter2) {
    super();
  }

  public async publish(event: DomainEvent): Promise<void> {
    this.eventEmitter.emit(event.eventName, event);
  }
}
