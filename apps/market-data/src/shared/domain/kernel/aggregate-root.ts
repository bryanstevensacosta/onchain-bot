import { DomainEvent } from './domain-event';
import { Entity } from './entity';

/**
 * AggregateRoot base class (Tramo 3, todo 1).
 *
 * Entity + DomainEvent collection. Rule: publish events only AFTER save(),
 * via commitEvents().
 */
export abstract class AggregateRoot<TId> extends Entity<TId> {
  protected constructor(id: TId) {
    super(id);
  }
}
