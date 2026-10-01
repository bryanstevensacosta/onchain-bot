/**
 * ValueObject base class (Tramo 2, todo 1).
 *
 * Mirrors apps/backend/src/shared/kernel/value-object.ts: immutable,
 * equality by structural value.
 */
export abstract class ValueObject<T> {
  protected constructor(protected readonly props: T) {}

  public equals(other: ValueObject<T>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    return JSON.stringify(this.props) === JSON.stringify(other.props);
  }

  protected get value(): T {
    return this.props;
  }
}
