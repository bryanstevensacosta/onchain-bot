import { DomainEvent } from './domain-event';
import { Entity } from './entity';

/**
 * AggregateRoot base class (Tramo 2, todo 1).
 *
 * Mirrors apps/backend/src/shared/kernel/aggregate-root.ts: Entity +
 * DomainEvent collection. Rule: publish events only AFTER save(),
 * via commitEvents().
 */
export abstract class AggregateRoot<TId> extends Entity<TId> {
  protected constructor(id: TId) {
    super(id);
  }
}
