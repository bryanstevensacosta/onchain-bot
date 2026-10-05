import { Injectable } from '@nestjs/common';
import { QueuedArticleRendererPort } from '@/queue/application/ports/queued-article-renderer.port';
import type { PublisherQueueEntry } from '@/queue/domain/publisher-queue-entry.entity';

/**
 * Text-only drain renderer (R-b1): raw passthrough, no LLM. The llm
 * half (todo 5) rebinds `QueuedArticleRendererPort` to the LLM
 * renderer without touching the drain use-case.
 */
@Injectable()
export class RawContentRendererAdapter extends QueuedArticleRendererPort {
  public async render(
    entry: PublisherQueueEntry,
  ): Promise<{ readonly content: string }> {
    return { content: entry.rawContent };
  }
}
