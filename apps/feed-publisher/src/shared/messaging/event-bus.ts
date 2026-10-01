import { DomainEvent } from '../kernel/domain-event';

/**
 * EventBusPort + InMemoryEventBusAdapter (Tramo 2, todo 1).
 *
 * Local fan-out for domain events. Rule (backend anti-pattern):
 * publish only AFTER save(), via aggregate commitEvents().
 */
export type EventHandler = (event: DomainEvent) => void | Promise<void>;

export abstract class EventBusPort {
  public abstract publish(event: DomainEvent): Promise<void>;
  public abstract subscribe(eventName: string, handler: EventHandler): void;
}

export class InMemoryEventBusAdapter extends EventBusPort {
  private readonly handlers = new Map<string, EventHandler[]>();

  public subscribe(eventName: string, handler: EventHandler): void {
    const list = this.handlers.get(eventName) ?? [];
    list.push(handler);
    this.handlers.set(eventName, list);
  }

  public async publish(event: DomainEvent): Promise<void> {
    const list = this.handlers.get(event.eventName) ?? [];
    for (const handler of list) {
      await handler(event);
    }
  }
}
