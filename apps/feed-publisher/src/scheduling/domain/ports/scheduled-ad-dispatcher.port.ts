import { ScheduledAd } from '../scheduled-ad.entity';
import type { SchedulingTarget } from '../scheduling-target';

export interface ScheduledAdDispatchResult {
  readonly ok: boolean;
  readonly messageId: number | null;
  readonly error: string | null;
}

/**
 * Outbound port: delivers a scheduling post to one target.
 * In-memory until todo 7 binds the real Bot API adapters (C2).
 */
export abstract class ScheduledAdDispatcherPort {
  public abstract publish(
    ad: ScheduledAd,
    target: SchedulingTarget,
  ): Promise<ScheduledAdDispatchResult>;
}
