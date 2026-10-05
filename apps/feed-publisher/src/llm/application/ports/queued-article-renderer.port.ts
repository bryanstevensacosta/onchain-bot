import type { LlmEntryView } from '@/llm/domain/llm-entry.view';

/**
 * Drain render port, llm side (R-b1).
 *
 * Queue-side twin lives in `apps/publishing-queue/` (bound to the raw
 * renderer until todo 5). This copy serves the feed-publisher
 * `LlmArticleRendererAdapter` so the flags + non-Latin guard path stays
 * compiled and tested pending the todo-5 move — then this file retires
 * in favor of the queue-owned port.
 */
export abstract class QueuedArticleRendererPort {
  public abstract render(
    entry: LlmEntryView,
  ): Promise<{ readonly content: string }>;
}
