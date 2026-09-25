import { DomainEvent } from '../kernel/domain-event';

/**
 * Shared domain events (Tramo 2, todo 1).
 *
 * Exact bus names follow the backend convention
 * `<bc>.<aggregate>.<action>`. Content events only — P10: no kol,
 * no vip-call events in this app.
 */
export class ContentQueuedEvent extends DomainEvent {
  constructor(
    public readonly contentId: string,
    public readonly contentType: string,
  ) {
    super('feed-publisher.queue.queued');
  }
}

export class ContentPublishedEvent extends DomainEvent {
  constructor(
    public readonly contentId: string,
    public readonly contentType: string,
    public readonly telegramMessageId: number,
  ) {
    super('feed-publisher.telegram.published');
  }
}

export class ContentPublishFailedEvent extends DomainEvent {
  constructor(
    public readonly contentId: string,
    public readonly contentType: string,
    public readonly reason: string,
  ) {
    super('feed-publisher.telegram.failed');
  }
}
