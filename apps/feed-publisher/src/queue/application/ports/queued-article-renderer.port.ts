import type { PublisherQueueEntry } from '../../domain/publisher-queue-entry.entity';

/**
 * Outbound port: render a queued entry into publishable text.
 *
 * Live binding is the raw-content passthrough (todo 4); todo 5 replaces
 * it with the LLM gateway (default) + mock. The use-case treats render
 * failures as retryable (attempts counted, FAILED after max).
 */
export abstract class QueuedArticleRendererPort {
  public abstract render(
    entry: PublisherQueueEntry,
  ): Promise<{ readonly content: string }>;
}
