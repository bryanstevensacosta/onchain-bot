import { Injectable } from '@nestjs/common';
import {
  MatchedMessageEnqueuePort,
  type EnqueueResult,
} from '../../../matching/domain/ports/matched-message-enqueue.port';
import type { FilteredFeedMessage } from '../../../matching/application/services/matching-evaluator.service';
import { EnqueueMatchingMessageUseCase } from '../../application/use-cases/enqueue-matching-message.use-case';

/**
 * Queue binding for the todo 3 `MatchedMessageEnqueuePort`.
 *
 * Replaces the `InMemoryMatchedMessageCollector` as the LIVE binding:
 * matched messages now flow into the unified queue (PENDING feed
 * or BLOCKED dedup rows) instead of the 500-slot buffer. The collector
 * remains as a test double only. Returns `{ enqueued: false }` for
 * media-gated skips and already-tracked replays (the matching cron
 * counts those as skipped, not errors).
 */
@Injectable()
export class QueueMatchedMessageAdapter extends MatchedMessageEnqueuePort {
  public constructor(
    private readonly enqueueMatching: EnqueueMatchingMessageUseCase,
  ) {
    super();
  }

  public async enqueue(message: FilteredFeedMessage): Promise<EnqueueResult> {
    const entry = await this.enqueueMatching.execute({ message });
    return { enqueued: entry !== null };
  }
}
