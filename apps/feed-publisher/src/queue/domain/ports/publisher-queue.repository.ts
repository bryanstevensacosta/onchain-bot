import type { PublisherQueueEntry } from '../publisher-queue-entry.entity';
import type { PublisherQueueStatus } from '../publisher-queue-status';

export interface PublisherQueueListOptions {
  readonly limit?: number;
  readonly status?: PublisherQueueStatus;
}

/**
 * Outbound port: unified-queue persistence.
 *
 * Live binding is the in-memory adapter (GAP-1); the TypeORM shape ships
 * unwired beside it. Implementations MUST throw QueueFullError only via
 * QueueManager (the repo itself never invents errors).
 */
export abstract class PublisherQueueRepository {
  public abstract save(entry: PublisherQueueEntry): Promise<void>;
  public abstract findById(id: string): Promise<PublisherQueueEntry | null>;
  public abstract findByChannelIdAndMessageId(
    channelId: string,
    messageId: number,
  ): Promise<PublisherQueueEntry | null>;
  public abstract findNextPending(): Promise<PublisherQueueEntry | null>;
  public abstract list(
    options?: PublisherQueueListOptions,
  ): Promise<PublisherQueueEntry[]>;
  public abstract countByStatus(status: PublisherQueueStatus): Promise<number>;
  public abstract findStale(
    olderThanMs: number,
    now?: Date,
  ): Promise<PublisherQueueEntry[]>;
  public abstract delete(id: string): Promise<boolean>;
}
