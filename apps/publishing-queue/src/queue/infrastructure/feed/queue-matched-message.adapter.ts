import { Injectable } from '@nestjs/common';
import {
  MatchedMessageEnqueuePort,
  type MatchedEnqueueResult,
  type MatchedFeedMessage,
} from '@/queue/application/ports/matched-message-enqueue.port';
import { EnqueueMatchingMessageUseCase } from '@/queue/application/use-cases/enqueue-matching-message.use-case';

/**
 * Queue binding for the todo 3 `MatchedMessageEnqueuePort`.
 *
 * Replaces the `InMemoryMatchedMessageCollector` as the LIVE binding:
 * matched messages now flow into the unified queue (PENDING feed
 * or BLOCKED dedup rows) instead of the 500-slot buffer. The collector
 * remains as a test double only. Returns `{ enqueued: false }` for
 * media-gated skips and already-tracked replays (the matching cron
 * counts those as skipped, not errors).
 *
 * R-b1: binds the queue-owned port (feed-publisher matching stays
 * the match owner per R6; the B1 dual feeds this over HTTP).
 */
@Injectable()
export class QueueMatchedMessageAdapter extends MatchedMessageEnqueuePort {
  public constructor(
    private readonly enqueueMatching: EnqueueMatchingMessageUseCase,
  ) {
    super();
  }

  public async enqueue(
    message: MatchedFeedMessage,
  ): Promise<MatchedEnqueueResult> {
    const entry = await this.enqueueMatching.execute({ message });
    return { enqueued: entry !== null };
  }
}
