import { AggregateRoot } from './aggregate-root';
import { DomainEvent } from './domain-event';

describe('AggregateRoot', () => {
  class TestEvent extends DomainEvent {
    constructor() {
      super('test.event');
    }
  }

  class TestAggregate extends AggregateRoot<string> {
    constructor(id: string) {
      super(id);
    }
  }

  it('is an entity with identity', () => {
    expect(new TestAggregate('1').equals(new TestAggregate('1'))).toBe(true);
  });
});
