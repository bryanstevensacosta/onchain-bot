/**
 * Base class for Entities.
 *
 * An Entity is defined by its identity (ID), not by its attributes.
 * Two entities are equal if they share the same ID, even if other attributes differ.
 *
 * Note: In this architecture, we use AggregateRoot for entities that own
 * a domain cluster. Pure entities (without behavior) are rare in DDD.
 */
export abstract class Entity<TId = string> {
  protected readonly _id: TId;

  protected constructor(id: TId) {
    this._id = id;
  }

  public get id(): TId {
    return this._id;
  }

  public equals(other: Entity<TId> | null | undefined): boolean {
    if (other === null || other === undefined) return false;
    if (other.constructor !== this.constructor) return false;
    return this._id === other._id;
  }
}
