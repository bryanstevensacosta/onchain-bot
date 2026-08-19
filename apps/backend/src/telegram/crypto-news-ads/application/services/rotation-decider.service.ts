import { Injectable } from '@nestjs/common';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { AdRotationConfig } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-config.entity';
import { AdRotationState } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-state.entity';

/**
 * Pure decision: should an ad be published this tick?
 *
 * Pure = no I/O. All inputs (config, state, active ads) are passed in;
 * the caller (PublishAdUseCase) is responsible for loading them.
 *
 * Order of checks (matters):
 *   1. no eligible ads      -> no-active-ads        (caller resets state)
 *   2. postsSinceLastAd < N -> posts-not-met
 *   3. within min-time      -> min-time-not-met
 *   4. else pick the next ad -> ok
 *
 * Expired ads are filtered out up front (defense-in-depth only — the repo
 * filter in `findAllActive(now)` is the primary guard; this keeps the
 * decider pure and never lets a stale expired row be picked).
 */
export interface RotationDecision {
  readonly shouldPublish: boolean;
  readonly ad: Ad | null;
  readonly reason:
    | 'posts-not-met'
    | 'min-time-not-met'
    | 'no-active-ads'
    | 'ok';
}

@Injectable()
export class RotationDeciderService {
  public async shouldPublishAd(
    now: Date,
    config: AdRotationConfig,
    state: AdRotationState,
    activeAds: ReadonlyArray<Ad>,
  ): Promise<RotationDecision> {
    const eligible = activeAds.filter((a) => !a.isExpired(now));
    if (eligible.length === 0) {
      return { shouldPublish: false, ad: null, reason: 'no-active-ads' };
    }

    if (state.postsSinceLastAd < config.everyNPosts) {
      return { shouldPublish: false, ad: null, reason: 'posts-not-met' };
    }

    if (
      state.lastAdPublishedAt !== null &&
      now.getTime() - state.lastAdPublishedAt.getTime() <
        config.minMinutesBetweenAds * 60_000
    ) {
      return { shouldPublish: false, ad: null, reason: 'min-time-not-met' };
    }

    const picked = this.pickNextAd(eligible, state.lastAdId);
    return { shouldPublish: true, ad: picked, reason: 'ok' };
  }

  /**
   * Round-robin ad selection keyed on `lastAdId`:
   *   - no prior ad (`lastAdId === null`)         -> first in list
   *   - prior ad not in list (deleted)            -> first in list (wrap)
   *   - otherwise                                 -> the next ad after the
   *                                                    prior one (wrap around
   *                                                    end -> first)
   */
  private pickNextAd(
    activeAds: ReadonlyArray<Ad>,
    lastAdId: string | null,
  ): Ad {
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
