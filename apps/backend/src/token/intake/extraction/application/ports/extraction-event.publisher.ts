import { DomainEventPublisher } from 'shared/common/ports/domain-event.publisher';

/**
 * Outbound port: publish extraction-domain events to downstream BCs.
 *
 * Implemented in infrastructure/messaging (in-process, Redis, Kafka, etc.)
 */
export abstract class ExtractionEventPublisher extends DomainEventPublisher {}
