import { DomainEventPublisher } from 'shared/common/ports/domain-event.publisher';

/**
 * Outbound port: publish parsing-domain events to downstream BCs.
 */
export abstract class ParsingEventPublisher extends DomainEventPublisher {}
