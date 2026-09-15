import { ThreadsQueueEntry } from 'threads/publisher/domain/entities/threads-queue-entry.entity';

/**
 * Outbound port: persistence for the Threads publisher queue.
 *
 * Threads-typed mirror of the crypto-news `PublisherQueueRepository`
 * interface shape (`telegram/crypto-news-publisher/application/ports/
 * publisher-queue.repository.ts`). Same read/write paths, same
 * single-transaction INSERT + overflow-DELETE contract inside
 * `enqueue()` — only the aggregate type and the cap differ (100 here,
 * 36 there).
 *
 * Read paths:
 * - `findNextPending()` returns the oldest PENDING entry (by
 *   messageReceivedAt ASC).
 * - `findAllForDisplay(limit)` returns the most-recent entries
 *   regardless of status, for the dashboard / queue view.
 * - `findByIdForDisplay(id)` returns a single entry by id.
 * - `countPublishedToday(resetHourUtc)` returns the number of
 *   PUBLISHED rows whose publishedAt falls in the current day window
 *   (window starts at `resetHourUtc` UTC, e.g. 04:00 UTC).
 * - `countPending()` returns the number of PENDING rows (live queue
 *   depth for the matching-health endpoint).
 *
 * Write paths:
 * - `enqueue(entry)` — INSERT + overflow DELETE in one transaction.
 *   Respects the `(channel_id, message_id)` unique constraint: a
 *   duplicate insert must fail (or be skipped by the caller via
 *   `findByChannelIdAndMessageId` first — see
 *   `EnqueueThreadsMessageUseCase`).
 * - `markPublished(id, threadsPostId)` / `markFailed(id, reason)`
 *   / `incrementAttempts(id)` — state machine transitions
 *   (PENDING/SCHEDULED only, mirroring `VALID_PUBLISH_TRANSITIONS`),
 *   returning the updated aggregate.
 */
export interface ThreadsGeneratedPublishData {
  readonly content: string;
  readonly systemPrompt: string | null;
  readonly userPrompt: string | null;
  readonly temperature: number | null;
  readonly reasoningEffort: string | null;
  readonly model: string | null;
}

export abstract class ThreadsQueueRepository {
  public abstract enqueue(entry: ThreadsQueueEntry): Promise<void>;
  public abstract findNextPending(): Promise<ThreadsQueueEntry | null>;
  public abstract markPublished(
    id: string,
    threadsPostId: string,
    generated?: ThreadsGeneratedPublishData,
  ): Promise<ThreadsQueueEntry>;
  public abstract markFailed(
    id: string,
    reason: string,
  ): Promise<ThreadsQueueEntry>;
  public abstract incrementAttempts(id: string): Promise<ThreadsQueueEntry>;
  public abstract findAllForDisplay(
    limit: number,
  ): Promise<ReadonlyArray<ThreadsQueueEntry>>;
  public abstract countPublishedToday(resetHourUtc: number): Promise<number>;
  public abstract countPending(): Promise<number>;
  public abstract findById(id: string): Promise<ThreadsQueueEntry | null>;
  public abstract findByIdForDisplay(
    id: string,
  ): Promise<ThreadsQueueEntry | null>;
  public abstract delete(id: string): Promise<void>;
  /**
   * Find all PENDING entries older than the given threshold (in
   * milliseconds). Used by ExpireStaleThreadsScheduler to expire
   * stale entries (24h). Returns entries ordered by queuedAt ASC
   * (oldest first).
   */
  public abstract findPendingOlderThan(
    thresholdMs: number,
  ): Promise<ReadonlyArray<ThreadsQueueEntry>>;
  /**
   * Find a queue entry by channelId and messageId.
   * Used for deduplication checks before enqueueing.
   * Returns null if no entry exists for the given channel/message pair.
   */
  public abstract findByChannelIdAndMessageId(
    channelId: string,
    messageId: number,
  ): Promise<ThreadsQueueEntry | null>;
}
