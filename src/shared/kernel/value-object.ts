/**
 * Base class for Value Objects.
 *
 * A Value Object is an immutable object defined by its attributes, not by an identity.
 * Two value objects are equal if all their attributes are equal.
 *
 * Rules:
 * - Immutable (no setters)
 * - Validated at construction
 * - Equality by value, not reference
 */
export abstract class ValueObject<TProps> {
  protected readonly props: TProps;

  protected constructor(props: TProps) {
    this.props = Object.freeze({ ...props });
  }

  /**
   * Structural equality: two value objects are equal if their props are deeply equal.
   */
  public equals(other: ValueObject<TProps> | null | undefined): boolean {
    if (other === null || other === undefined) return false;
    if (other.constructor !== this.constructor) return false;
    return this.deepEquals(this.props, other.props);
  }

  private deepEquals(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;
    if (a === null || b === null) return false;
    if (typeof a !== 'object') return false;

    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b as object);

    if (aKeys.length !== bKeys.length) return false;

    return aKeys.every((key) =>
      this.deepEquals(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
    );
  }

  /**
   * Returns a shallow copy of the underlying props.
   * Use this to expose state safely.
   */
  public toObject(): Readonly<TProps> {
    return { ...this.props };
  }
}
