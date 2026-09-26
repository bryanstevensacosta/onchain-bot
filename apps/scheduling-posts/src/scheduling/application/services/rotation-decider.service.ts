import { Injectable } from '@nestjs/common';
import { ScheduledAd } from '../../domain/scheduled-ad.entity';
import { SchedulingConfig } from '../../domain/scheduling-config.entity';
import { SchedulingState } from '../../domain/scheduling-state.entity';
import type { SchedulingTarget } from '../../domain/scheduling-target';

export type RotationHoldReason =
  | 'posts-not-met'
  | 'min-time-not-met'
  | 'publish-delay-not-met'
  | 'daily-cap-reached'
  | 'no-active-ads'
  | 'ok';

/**
 * Pure decision: should a scheduling post go out to `target` now?
 *
 * Pure = no I/O. All inputs (config, state, active posts) are passed
 * in; the caller (PublishScheduledAdUseCase) loads them.
 *
 * Order of checks (matters):
 *   1. no eligible posts            -> no-active-ads
 *   2. postsSinceLastAd < N         -> posts-not-met (global news cadence)
 *   3. within global min-time       -> min-time-not-met (per-target cursor)
 *   4. within target publish delay  -> publish-delay-not-met (P38)
 *   5. target daily cap reached     -> daily-cap-reached, HELD (P38)
 *   6. else round-robin from the target cursor -> ok
 *
 * Expired posts are filtered up front (defense-in-depth; the repo
 * `findAllActive` filter is the primary guard).
 *
 * A `daily-cap-reached` post is HELD to the next UTC day, never
 * dropped: `heldUntilNextDay` tells the caller to leave the cursor
 * untouched so the same post is retried tomorrow.
 */
export interface RotationDecision {
  readonly shouldPublish: boolean;
  readonly ad: ScheduledAd | null;
  readonly reason: RotationHoldReason;
  readonly heldUntilNextDay: boolean;
}

@Injectable()
export class RotationDeciderService {
  public async shouldPublishAd(args: {
    now: Date;
    target: SchedulingTarget;
    config: SchedulingConfig;
    state: SchedulingState;
    activeAds: ReadonlyArray<ScheduledAd>;
  }): Promise<RotationDecision> {
    const { now, target, config, state, activeAds } = args;
    const eligible = activeAds.filter((a) => !a.isExpired(now));
    if (eligible.length === 0) {
      return {
        shouldPublish: false,
        ad: null,
        reason: 'no-active-ads',
        heldUntilNextDay: false,
      };
    }
    if (state.postsSinceLastAd < config.everyNPosts) {
      return {
        shouldPublish: false,
        ad: null,
        reason: 'posts-not-met',
        heldUntilNextDay: false,
      };
    }
    const cursor = state.cursorFor(target);
    const limits = config.limitsFor(target);
    if (
      cursor.lastPublishedAt !== null &&
      now.getTime() - cursor.lastPublishedAt.getTime() <
        config.minMinutesBetweenAds * 60_000
    ) {
      return {
        shouldPublish: false,
        ad: null,
        reason: 'min-time-not-met',
        heldUntilNextDay: false,
      };
    }
    if (
      cursor.lastPublishedAt !== null &&
      now.getTime() - cursor.lastPublishedAt.getTime() < limits.publishDelayMs
    ) {
      return {
        shouldPublish: false,
        ad: null,
        reason: 'publish-delay-not-met',
        heldUntilNextDay: false,
      };
    }
    if (state.publishedTodayFor(target, now) >= limits.dailyCap) {
      return {
        shouldPublish: false,
        ad: null,
        reason: 'daily-cap-reached',
        heldUntilNextDay: true,
      };
    }
    const picked = RotationDeciderService.pickNextAd(eligible, cursor.lastAdId);
    return {
      shouldPublish: true,
      ad: picked,
      reason: 'ok',
      heldUntilNextDay: false,
    };
  }

  /**
   * Round-robin keyed on the target `lastAdId`: no prior post (or a
   * deleted one) -> first in list, else the next post after the prior
   * one, wrapping around.
   */
  private static pickNextAd(
    activeAds: ReadonlyArray<ScheduledAd>,
    lastAdId: string | null,
  ): ScheduledAd {
    if (lastAdId === null) {
      return activeAds[0];
    }
    const idx = activeAds.findIndex((a) => a.id === lastAdId);
    if (idx === -1) {
      return activeAds[0];
    }
    return activeAds[(idx + 1) % activeAds.length];
  }
}
