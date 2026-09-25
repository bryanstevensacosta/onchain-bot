import type { FilteredFeedMessage } from '../../application/services/matching-evaluator.service';

export interface EnqueueResult {
  readonly enqueued: boolean;
}

/**
 * Outbound port: handoff of a matched message toward the unified queue.
 *
 * Todo 4 binds this to the real queue (`EnqueueMatchingMessage` +
 * discriminator `contentType`). Until then the in-memory collector is
 * live so the cron tick is exercisable end-to-end without drops.
 */
export abstract class MatchedMessageEnqueuePort {
  public abstract enqueue(
    message: FilteredFeedMessage,
  ): Promise<EnqueueResult>;
}
