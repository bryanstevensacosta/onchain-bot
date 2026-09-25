import { Injectable, Logger } from '@nestjs/common';
import { ScheduledAdRepository } from '../../domain/ports/scheduled-ad.repository';
import { SchedulingConfigRepository } from '../../domain/ports/scheduling-config.repository';
import { SchedulingStateRepository } from '../../domain/ports/scheduling-state.repository';
import { ScheduledAdDispatcherPort } from '../../domain/ports/scheduled-ad-dispatcher.port';
import { RotationDeciderService } from '../services/rotation-decider.service';
import type { SchedulingTarget } from '../../domain/scheduling-target';
import { SchedulingHealthState } from '../state/scheduling-health.state';

/**
 * Per-tick orchestration for one scheduling target. Mirrors the
 * backend `PublishAdUseCase` with the P38 per-target gates:
 *
 *   1. Master switch `SchedulingConfig.enabled === false` -> return.
 *   2. No active posts -> `resetPostsSinceLastAd()` + return.
 *   3. `RotationDeciderService.shouldPublishAd` for THIS target ->
 *      hold reasons return early. A `daily-cap-reached` hold leaves
 *      the cursor untouched: the post is retried after the UTC-day
 *      rollover, never dropped, never failure-counted.
 *   4. Dispatch via `ScheduledAdDispatcherPort` (in-memory until
 *      todo 7 binds Bot API; missing publisher returns ok=false and
 *      is treated as not-configured: no failure bookkeeping).
 *   5. Success: persist cursor + dispatcher timestamp + ad stats.
 *      The shared cadence counter is NOT reset here — the cron
 *      resets it once per tick when any target published, so one
 *      target cannot starve its sibling mid-tick.
 *   6. Failure: increment failures, disable after 3 consecutive.
 *
 * Returns true when this call published (the cron uses it to reset
 * the shared cadence once per tick).
 */
@Injectable()
export class PublishScheduledAdUseCase {
  private readonly logger = new Logger(PublishScheduledAdUseCase.name);

  public constructor(
    private readonly adRepo: ScheduledAdRepository,
    private readonly configRepo: SchedulingConfigRepository,
    private readonly stateRepo: SchedulingStateRepository,
    private readonly decider: RotationDeciderService,
    private readonly dispatcher: ScheduledAdDispatcherPort,
    private readonly health: SchedulingHealthState,
  ) {}

  public async execute(
    target: SchedulingTarget,
    now: Date = new Date(),
  ): Promise<boolean> {
    const cfg = await this.configRepo.load();
    if (!cfg.enabled) {
      return false;
    }
    const activeAds = await this.adRepo.findAllActive(now);
    if (activeAds.length === 0) {
      await this.stateRepo.resetPostsSinceLastAd();
      return false;
    }
    const state = await this.stateRepo.load();
    const decision = await this.decider.shouldPublishAd({
      now,
      target,
      config: cfg,
      state,
      activeAds,
    });
    if (!decision.shouldPublish || decision.ad === null) {
      this.logger.log(
        `scheduling rotation decision for ${target}: ${decision.reason}`,
      );
      return false;
    }
    const ad = decision.ad;
    const result = await this.dispatcher.publish(ad, target);
    if (result.ok && result.messageId !== null) {
      await this.stateRepo.markPublished(target, ad.id, now);
      await this.adRepo.markPublished(ad.id, String(result.messageId), now);
      this.health.recordPublished(target, now);
      this.logger.log(
        `published scheduled post ${ad.id} to ${target} as message ${result.messageId}`,
      );
      return true;
    }
    await this.handlePublishFailure(ad.id, result.error ?? 'unknown error');
    return false;
  }

  /**
   * Records a news publish against the shared cadence counter so a
   * scheduling post fires every N news posts. Wired to the queue
   * drain in todo 7; exposed now so the cadence is testable.
   */
  public async recordNewsPost(): Promise<void> {
    const state = await this.stateRepo.load();
    await this.stateRepo.save(state.incrementPostsSinceLastAd());
  }

  private async handlePublishFailure(
    adId: string,
    error: string,
  ): Promise<void> {
    if (PublishScheduledAdUseCase.isNotConfiguredError(error)) {
      this.logger.warn(
        `publisher not configured — leaving scheduled post ${adId} enabled (${error})`,
      );
      return;
    }
    await this.adRepo.incrementFailures(adId);
    const after = await this.adRepo.findById(adId);
    if (after && after.consecutiveFailures >= 3) {
      await this.adRepo.disable(adId);
      this.logger.warn(
        `scheduled post ${adId} disabled after 3 consecutive failures`,
      );
    }
    this.health.recordFailure(error);
  }

  private static isNotConfiguredError(msg: string): boolean {
    return (
      msg.includes('CRYPTO_NEWS_BOT_TOKEN') ||
      msg.includes('THREADS_BOT_TOKEN') ||
      msg.includes('not configured')
    );
  }
}
