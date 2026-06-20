import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from 'shared/kernel/domain-event';
import { ChainDetectionEventPublisher } from 'ca/chain-detection/application/ports/chain-detection-event.publisher';

@Injectable()
export class InProcessChainDetectionEventPublisher extends ChainDetectionEventPublisher {
  private readonly logger = new Logger(
    InProcessChainDetectionEventPublisher.name,
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
