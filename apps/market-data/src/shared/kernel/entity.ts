import { DomainEvent } from './domain-event';

/**
 * Entity base class (Tramo 3, todo 1).
 *
 * Identity by id + domain-event collection drained via commitEvents().
 */
export abstract class Entity<TId> {
  private events: DomainEvent[] = [];

  protected constructor(public readonly id: TId) {}

  public equals(other: Entity<TId>): boolean {
    return other !== undefined && other !== null && other.id === this.id;
  }

  protected addEvent(event: DomainEvent): void {
    this.events.push(event);
  }

  public commitEvents(): DomainEvent[] {
    const pending = [...this.events];
    this.events = [];
    return pending;
  }
}
