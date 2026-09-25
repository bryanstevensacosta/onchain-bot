import { DomainEvent } from './domain-event';
import { Entity } from './entity';

describe('Entity', () => {
  class TestEvent extends DomainEvent {
    constructor() {
      super('test.event');
    }
  }

  class TestEntity extends Entity<string> {
    public raise(): void {
      this.addEvent(new TestEvent());
    }
  }

  it('equals compares by id', () => {
    expect(new TestEntity('1').equals(new TestEntity('1'))).toBe(true);
    expect(new TestEntity('1').equals(new TestEntity('2'))).toBe(false);
  });

  it('commitEvents drains the collected events', () => {
    const entity = new TestEntity('1');
    entity.raise();
    expect(entity.commitEvents()).toHaveLength(1);
    expect(entity.commitEvents()).toHaveLength(0);
  });
});
