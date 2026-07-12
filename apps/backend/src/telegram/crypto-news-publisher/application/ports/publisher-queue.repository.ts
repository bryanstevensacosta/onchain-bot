import { PublisherQueueEntry } from 'telegram/crypto-news-publisher/domain/entities/publisher-queue-entry.entity';

/**
 * Outbound port: persistence for the crypto-news publisher queue.
 *
 * The queue is capped at 36 entries (oldest dropped when a new match
 * arrives); that cap is enforced inside `enqueue()` via an INSERT +
 * overflow DELETE running in a single transaction (atomic from the
 * caller's perspective).
 *
 * Read paths:
 * - `findNextPending()` returns the oldest PENDING entry (by
 *   messageReceivedAt ASC).
 * - `findAllForDisplay(limit)` returns the most-recent entries
 *   regardless of status, for the dashboard / queue view.
 * - `findByIdForDisplay(id)` returns a single entry by id, used by
 *   the media-serving endpoint to resolve `imagePath`.
 * - `countPublishedToday(resetHourUtc)` returns the number of
 *   PUBLISHED rows whose publishedAt falls in the current day window
 *   (window starts at `resetHourUtc` UTC, e.g. 04:00 UTC).
 *
 * Write paths:
 * - `enqueue(entry)` — INSERT + DELETE in one transaction.
 * - `markPublished(id, telegramMessageId)` / `markFailed(id, reason)`
 *   / `incrementAttempts(id)` — state machine transitions, returning
 *   the updated aggregate.
 */
export interface GeneratedPublishData {
  readonly content: string;
  readonly systemPrompt: string | null;
  readonly userPrompt: string;
  readonly temperature: number | null;
  readonly reasoningEffort: string | null;
  readonly model: string;
}

export abstract class PublisherQueueRepository {
  public abstract enqueue(entry: PublisherQueueEntry): Promise<void>;
  public abstract findNextPending(): Promise<PublisherQueueEntry | null>;
  public abstract markPublished(
    id: string,
    telegramMessageId: string,
    generated?: GeneratedPublishData,
  ): Promise<PublisherQueueEntry>;
  public abstract markFailed(
    id: string,
    reason: string,
  ): Promise<PublisherQueueEntry>;
  public abstract incrementAttempts(id: string): Promise<PublisherQueueEntry>;
  public abstract findAllForDisplay(
    limit: number,
  ): Promise<ReadonlyArray<PublisherQueueEntry>>;
  public abstract countPublishedToday(resetHourUtc: number): Promise<number>;
  public abstract findById(id: string): Promise<PublisherQueueEntry | null>;
  public abstract findByIdForDisplay(
    id: string,
  ): Promise<PublisherQueueEntry | null>;
  public abstract delete(id: string): Promise<void>;
}
