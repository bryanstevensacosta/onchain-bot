import { DomainEvent } from './domain-event';

describe('DomainEvent', () => {
  class TestEvent extends DomainEvent {
    constructor() {
      super('test.event');
    }
  }

  it('carries its name and timestamp', () => {
    const event = new TestEvent();
    expect(event.eventName).toBe('test.event');
    expect(event.occurredAt).toBeInstanceOf(Date);
  });
});
