/**
 * Base class for Aggregate Roots.
 *
 * Aggregate Root is an entity that owns a domain cluster.
 * It receives commands, applies business rules, and emits domain events.
 *
 * Per docs/nest-js/22-cqrs.md and docs/arch/04-domain-layer.md:
 * - Holds business invariants
 * - Emits domain events via apply()
 * - Uncommitted events must be committed explicitly (or auto-commit)
 *
 * This is the framework-agnostic core. NestJS-specific concerns (CQRS bus, etc.)
 * live in adapters/infrastructure layers.
 */
import { DomainEvent } from './domain-event';

export abstract class AggregateRoot<TId = string> {
  protected readonly _id: TId;
  private _uncommittedEvents: DomainEvent[] = [];
  protected autoCommit = false;

  protected constructor(id: TId) {
    this._id = id;
  }

  public get id(): TId {
    return this._id;
  }

  /**
   * Apply a domain event and mutate state.
   * The event is queued for dispatch after a successful commit.
   */
  protected apply(event: DomainEvent): void {
    this.mutate(event);
    this._uncommittedEvents.push(event);
    if (this.autoCommit) {
      this.commit();
    }
  }

  /**
   * Mutate aggregate state from a domain event.
   * Subclasses implement this to handle events (event sourcing style).
   */
  protected abstract mutate(event: DomainEvent): void;

  /**
   * Return and clear uncommitted events.
   */
  public commit(): DomainEvent[] {
    const events = this._uncommittedEvents;
    this._uncommittedEvents = [];
    return events;
  }

  /**
   * Return current uncommitted events without clearing.
   */
  public getUncommittedEvents(): DomainEvent[] {
    return [...this._uncommittedEvents];
  }

  /**
   * Re-apply events to rebuild state (for event sourcing).
   */
  public loadFromHistory(events: DomainEvent[]): void {
    for (const event of events) {
      this.mutate(event);
    }
  }

  /**
   * Discard pending events (used when transaction fails).
   */
  public uncommit(): void {
    this._uncommittedEvents = [];
  }
}
