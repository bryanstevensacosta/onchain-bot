import { AggregateRoot } from './aggregate-root';
import { DomainEvent } from './domain-event';

class TestEvent extends DomainEvent {
  constructor(
    aggregateId: string,
    public readonly value: number,
  ) {
    super('test.event', aggregateId);
    Object.freeze(this);
  }

  public toPayload(): Record<string, unknown> {
    return { value: this.value };
  }
}

class TestAggregate extends AggregateRoot<string> {
  public total = 0;

  private constructor(id: string) {
    super(id);
  }

  public static create(id: string, value: number): TestAggregate {
    const agg = new TestAggregate(id);
    agg.apply(new TestEvent(id, value));
    return agg;
  }

  public add(value: number): void {
    this.apply(new TestEvent(this.id, value));
  }

  public enableAutoCommit(): void {
    this.autoCommit = true;
  }

  protected mutate(event: DomainEvent): void {
    if (event instanceof TestEvent) {
      this.total += event.value;
    }
  }
}

describe('AggregateRoot', () => {
  it('collects applied events as uncommitted', () => {
    const agg = TestAggregate.create('agg-1', 5);
    const pending = agg.getUncommittedEvents();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toBeInstanceOf(TestEvent);
  });

  it('mutates state when applying events', () => {
    const agg = TestAggregate.create('agg-1', 5);
    agg.add(3);
    expect(agg.total).toBe(8);
  });

  it('commit returns events and clears the queue', () => {
    const agg = TestAggregate.create('agg-1', 5);
    agg.add(3);
    const committed = agg.commit();
    expect(committed).toHaveLength(2);
    expect(agg.getUncommittedEvents()).toHaveLength(0);
    expect(agg.commit()).toHaveLength(0);
  });

  it('getUncommittedEvents returns a copy, not the live queue', () => {
    const agg = TestAggregate.create('agg-1', 5);
    const peek = agg.getUncommittedEvents();
    peek.length = 0;
    expect(agg.getUncommittedEvents()).toHaveLength(1);
  });

  it('uncommit discards pending events without touching state', () => {
    const agg = TestAggregate.create('agg-1', 5);
    agg.uncommit();
    expect(agg.getUncommittedEvents()).toHaveLength(0);
    expect(agg.total).toBe(5);
  });

  it('loadFromHistory rebuilds state without queueing events', () => {
    const agg = TestAggregate.create('agg-1', 5);
    agg.commit();
    agg.loadFromHistory([new TestEvent('agg-1', 10)]);
    expect(agg.total).toBe(15);
    expect(agg.getUncommittedEvents()).toHaveLength(0);
  });

  it('autoCommit commits immediately on apply', () => {
    const agg = TestAggregate.create('agg-1', 5);
    agg.commit();
    agg.enableAutoCommit();
    agg.add(7);
    expect(agg.total).toBe(12);
    expect(agg.getUncommittedEvents()).toHaveLength(0);
  });

  it('exposes its id', () => {
    const agg = TestAggregate.create('agg-9', 1);
    expect(agg.id).toBe('agg-9');
  });
});
