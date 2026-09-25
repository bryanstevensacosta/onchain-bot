import { Injectable } from '@nestjs/common';
import {
  MatchedMessageEnqueuePort,
  type EnqueueResult,
} from '../../domain/ports/matched-message-enqueue.port';
import type { FilteredFeedMessage } from '../../application/services/matching-evaluator.service';

/**
 * Collecting `MatchedMessageEnqueuePort` — the LIVE binding until todo 4.
 *
 * Buffers matched messages in memory (cap 500, oldest dropped) so the
 * cron tick is exercisable end-to-end today. Todo 4 replaces this binding
 * with the unified-queue adapter; the collector then remains as a test
 * double only.
 */
@Injectable()
export class InMemoryMatchedMessageCollector extends MatchedMessageEnqueuePort {
  private readonly buffer: FilteredFeedMessage[] = [];
  private readonly MAX_BUFFERED = 500;

  public async enqueue(
    message: FilteredFeedMessage,
  ): Promise<EnqueueResult> {
    this.buffer.push(message);
    while (this.buffer.length > this.MAX_BUFFERED) {
      this.buffer.shift();
    }
    return { enqueued: true };
  }

  public collected(): ReadonlyArray<FilteredFeedMessage> {
    return [...this.buffer];
  }

  public clear(): void {
    this.buffer.length = 0;
  }
}
