import type { PublisherQueueEntry } from '../../domain/publisher-queue-entry.entity';

/**
 * Outbound port: dispatch rendered content to Telegram.
 *
 * Live binding is the in-memory recorder (todo 4, synthetic ids); todo 7
 * replaces it with the crypto+threads Bot API adapters (C2). Dispatch
 * failures are retryable EXCEPT "not configured" errors, which release
 * the entry back to PENDING without consuming an attempt.
 */
export abstract class QueuedArticleDispatcherPort {
  public abstract dispatch(
    entry: PublisherQueueEntry,
    content: string,
  ): Promise<{ readonly telegramMessageId: string }>;
}
