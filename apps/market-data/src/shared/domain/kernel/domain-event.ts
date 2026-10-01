/**
 * DomainEvent base (Tramo 3, todo 1).
 *
 * Mirrors the sibling extraction services: named events (<bc>.<aggregate>.
 * <action>), published only AFTER save() via commitEvents().
 */
export abstract class DomainEvent {
  public readonly occurredAt: Date = new Date();

  protected constructor(public readonly name: string) {}
}
