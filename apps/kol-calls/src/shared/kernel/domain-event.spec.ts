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

describe('DomainEvent', () => {
  it('carries eventName and aggregateId', () => {
    const event = new TestEvent('agg-1', 5);
    expect(event.eventName).toBe('test.event');
    expect(event.aggregateId).toBe('agg-1');
  });

  it('assigns a unique eventId and an occurredAt timestamp', () => {
    const first = new TestEvent('agg-1', 1);
    const second = new TestEvent('agg-1', 2);
    expect(first.eventId).toBeTruthy();
    expect(second.eventId).toBeTruthy();
    expect(first.eventId).not.toBe(second.eventId);
    expect(first.occurredAt).toBeInstanceOf(Date);
  });

  it('exposes its payload via toPayload', () => {
    expect(new TestEvent('agg-1', 7).toPayload()).toEqual({ value: 7 });
  });
});
