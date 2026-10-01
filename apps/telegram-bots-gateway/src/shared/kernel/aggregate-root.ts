export abstract class AggregateRoot<TId> {
  public constructor(public readonly id: TId) {}
}
