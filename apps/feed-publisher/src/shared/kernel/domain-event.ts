/**
 * DomainEvent base class (Tramo 2, todo 1).
 *
 * Mirrors apps/backend/src/shared/kernel/domain-event.ts: immutable
 * event envelope with name + occurredAt.
 */
export abstract class DomainEvent {
  public readonly occurredAt: Date = new Date();

  protected constructor(public readonly eventName: string) {}
}
