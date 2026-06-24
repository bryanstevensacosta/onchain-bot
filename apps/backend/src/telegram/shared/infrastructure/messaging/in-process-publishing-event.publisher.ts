import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from 'shared/kernel/domain-event';
import { PublishingEventPublisher } from 'telegram/shared/application/ports/publishing-event.publisher';

@Injectable()
export class InProcessPublishingEventPublisher implements PublishingEventPublisher {
  public constructor(private readonly eventEmitter: EventEmitter2) {}

  public async publish(event: DomainEvent): Promise<void> {
    this.eventEmitter.emit(event.eventName, event);
  }

  public async publishAll(events: ReadonlyArray<DomainEvent>): Promise<void> {
    for (const event of events) {
      await this.publish(event);
    }
  }
}
