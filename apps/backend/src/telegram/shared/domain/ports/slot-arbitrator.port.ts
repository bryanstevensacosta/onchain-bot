export type SlotScope = 'news' | 'ads';

export interface SlotDecision {
  readonly canPublish: boolean;
  readonly nextSlotAvailableAt: Date | null;
  readonly remainingSeconds: number;
  readonly lastScope: SlotScope | null;
  readonly reason: 'ok' | 'min-gap-not-met' | 'unknown-scope';
}

/**
 * Mutual-exclusion gate between publishers that share a single output
 * channel (news + ads). Guarantees two publishes never land in the
 * same `min_seconds_between_slots` window, regardless of which scope
 * published last.
 */
export abstract class SlotArbitratorPort {
  public abstract canPublishNow(
    scope: SlotScope,
    now: Date,
  ): Promise<SlotDecision>;
  public abstract recordPublish(scope: SlotScope, at: Date): Promise<void>;
}
