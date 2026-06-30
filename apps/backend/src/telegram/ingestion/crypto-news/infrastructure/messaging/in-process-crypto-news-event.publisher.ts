import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from 'shared/kernel/domain-event';
import { CryptoNewsEventPublisher } from 'telegram/ingestion/crypto-news/application/ports/crypto-news-event.publisher';

/**
 * In-process implementation of CryptoNewsEventPublisher using NestJS
 * EventEmitter2. Mirrors InProcessKolEventPublisher.
 */
@Injectable()
export class InProcessCryptoNewsEventPublisher extends CryptoNewsEventPublisher {
  private readonly logger = new Logger(InProcessCryptoNewsEventPublisher.name);

  constructor(private readonly eventEmitter: EventEmitter2) {
    super();
  }

  public async publish(event: DomainEvent): Promise<void> {
    this.logger.debug(event.eventName, event.aggregateId);
    this.eventEmitter.emit(event.eventName, event);
  }
}
