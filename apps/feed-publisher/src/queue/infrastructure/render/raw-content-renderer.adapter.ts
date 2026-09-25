import { Injectable } from '@nestjs/common';
import { QueuedArticleRendererPort } from '../../application/ports/queued-article-renderer.port';
import type { PublisherQueueEntry } from '../../domain/publisher-queue-entry.entity';

/**
 * Raw-content renderer — the LIVE binding until todo 5.
 *
 * Returns the filtered raw content untouched (no LLM call): the drain
 * path publishes "raw pipeline" output while the gateway lands. Todo 5
 * rebinds `QueuedArticleRendererPort` to the LLM gateway + mock.
 */
@Injectable()
export class RawContentRendererAdapter extends QueuedArticleRendererPort {
  public async render(
    entry: PublisherQueueEntry,
  ): Promise<{ readonly content: string }> {
    return { content: entry.rawContent };
  }
}
