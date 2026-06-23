import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from 'shared/kernel/domain-event';
import { KolEventPublisher } from 'telegram-kol/ingestion/application/ports/kol-event.publisher';

/**
 * In-process event publisher.
 *
 * Emits via NestJS EventEmitter2 so cross-BC subscribers (e.g. extraction)
 * can listen with @OnEvent. For multi-process deployments, replace with a
 * Redis/Kafka publisher that publishes to a broker.
 *
 * Fase 4 of the kol-refactor plan: renamed from `InProcessTelegramEventPublisher`.
 */
@Injectable()
export class InProcessKolEventPublisher extends KolEventPublisher {
  private readonly logger = new Logger(InProcessKolEventPublisher.name);

  public constructor(private readonly eventEmitter: EventEmitter2) {
    super();
  }

  public async publish(event: DomainEvent): Promise<void> {
    this.logger.debug(
      `event=${event.eventName} aggregateId=${event.aggregateId}`,
    );
    this.eventEmitter.emit(event.eventName, event);
  }
}
