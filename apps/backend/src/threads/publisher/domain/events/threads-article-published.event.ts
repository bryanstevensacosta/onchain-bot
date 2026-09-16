import { DomainEvent } from 'shared/kernel/domain-event';

/**
 * Emitted when a queued Threads article is successfully published
 * to the Threads account via the Threads Graph API.
 *
 * Carries the minimum metadata needed by downstream consumers
 * (dashboard, analytics): which channel, which source message, the
 * Threads-side post id, and the publish timestamp.
 *
 * The raw `content` field of the source message is NEVER included
 * in this event. Downstream observers that need the body should
 * query the threads queue repository.
 */
export class ThreadsArticlePublishedEvent extends DomainEvent {
  public readonly payload: {
    readonly channelId: string;
    readonly messageId: number;
    readonly threadsPostId: string;
    readonly publishedAt: Date;
  };

  constructor(payload: {
    channelId: string;
    messageId: number;
    threadsPostId: string;
    publishedAt: Date;
  }) {
    super(
      'threads-publisher.article.published',
      `${payload.channelId}:${payload.messageId}`,
    );
    this.payload = Object.freeze({ ...payload });
  }

  public toPayload(): Record<string, unknown> {
    return {
      channelId: this.payload.channelId,
      messageId: this.payload.messageId,
      threadsPostId: this.payload.threadsPostId,
      publishedAt: this.payload.publishedAt.toISOString(),
    };
  }
}
