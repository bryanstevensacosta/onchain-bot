import { DomainEventPublisher } from 'shared/common/ports/domain-event.publisher';

/**
 * Outbound port: publishing of crypto-news domain events.
 *
 * Implemented in infrastructure/messaging (in-process via EventEmitter2).
 */
export abstract class CryptoNewsEventPublisher extends DomainEventPublisher {}
