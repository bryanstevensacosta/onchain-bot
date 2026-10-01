import { DomainEvent } from '../kernel/domain-event';
import { EventBusPort, InMemoryEventBusAdapter } from './event-bus';

describe('InMemoryEventBusAdapter', () => {
  class TestEvent extends DomainEvent {
    constructor() {
      super('test.event');
    }
  }

  it('fans out to subscribers of the same name only', async () => {
    const bus: EventBusPort = new InMemoryEventBusAdapter();
    const seen: string[] = [];
    bus.subscribe('test.event', () => {
      seen.push('hit');
    });
    bus.subscribe('other.event', () => {
      seen.push('miss');
    });
    await bus.publish(new TestEvent());
    expect(seen).toEqual(['hit']);
  });
});
