/**
 * Base class for Domain Events.
 *
 * Domain events represent facts that happened in the past.
 * They are immutable, named with past tense, and carry the minimal payload
 * needed by consumers.
 *
 * Per docs/arch/04-domain-layer.md:
 * - Pure data
 * - No behavior
 * - Named in past tense (OrderCreated, not CreateOrder)
 */
export abstract class DomainEvent {
  public readonly occurredAt: Date;
  public readonly eventId: string;

  protected constructor(
    public readonly eventName: string,
    public readonly aggregateId: string,
  ) {
    this.occurredAt = new Date();
    this.eventId = crypto.randomUUID();
  }

  /**
   * Concrete events expose their props via a getter.
   */
  public abstract toPayload(): Record<string, unknown>;
}
