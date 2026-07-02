import { DomainEventPublisher } from 'shared/common/ports/domain-event.publisher';

/**
 * Outbound port: publish normalization-domain events to downstream BCs.
 */
export abstract class NormalizationEventPublisher extends DomainEventPublisher {}
