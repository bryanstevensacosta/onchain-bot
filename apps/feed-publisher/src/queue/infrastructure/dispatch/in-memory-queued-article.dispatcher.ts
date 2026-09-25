import { Injectable } from '@nestjs/common';
import { QueuedArticleDispatcherPort } from '../../application/ports/queued-article-dispatcher.port';
import type { PublisherQueueEntry } from '../../domain/publisher-queue-entry.entity';

export interface RecordedDispatch {
  readonly entryId: string;
  readonly contentType: string;
  readonly content: string;
}

/**
 * In-memory dispatch recorder — the LIVE binding until todo 7.
 *
 * Records (entry, content) pairs and returns synthetic `tg-N` ids so the
 * drain path is exercisable end-to-end today. Todo 7 rebinds
 * `QueuedArticleDispatcherPort` to the crypto+threads Bot API adapters
 * (C2); this class remains as a test double only.
 */
@Injectable()
export class InMemoryQueuedArticleDispatcher extends QueuedArticleDispatcherPort {
  private readonly dispatched: RecordedDispatch[] = [];
  private sequence = 0;

  public async dispatch(
    entry: PublisherQueueEntry,
    content: string,
  ): Promise<{ readonly telegramMessageId: string }> {
    this.sequence += 1;
    this.dispatched.push({
      entryId: entry.id,
      contentType: entry.contentType,
      content,
    });
    return { telegramMessageId: `tg-${this.sequence}` };
  }

  public recorded(): ReadonlyArray<RecordedDispatch> {
    return [...this.dispatched];
  }

  public clear(): void {
    this.dispatched.length = 0;
  }
}
