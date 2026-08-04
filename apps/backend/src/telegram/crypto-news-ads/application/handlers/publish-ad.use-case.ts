import { Injectable, Logger } from '@nestjs/common';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import { AdRotationConfigRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-config.repository';
import { AdRotationStateRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-state.repository';
import { SharedThrottleSchedulerService } from 'telegram/shared/application/services/shared-throttle-scheduler.service';
import { SlotArbitratorPort } from 'telegram/shared/domain/ports/slot-arbitrator.port';
import { TelegramPublisherPort } from 'telegram/shared';
import { RotationDeciderService } from 'telegram/crypto-news-ads/application/services/rotation-decider.service';

/**
 * Per-tick orchestration for the ads publisher. Mirrors
 * `ProcessNextQueuedArticleUseCase` but for ads: a rotated ad is sent
 * to the SAME crypto-news output channel, gated by all three layers
 * (slot mutual-exclusion + random-delay throttle + hybrid α3 rotation
 * decision).
 *
 * Order of gates (all must pass before a publish):
 *   1. Master switch: `AdRotationConfig.enabled === false` → return.
 *   2. Active ads: none → `resetPostsSinceLastAd()` (α₃-A) + return.
 *   3. Slot: `slotArbitrator.canPublishNow('ads')` false → return.
 *   4. Throttle: `sharedThrottle.shouldPublish()` false → return.
 *   5. Decision: `RotationDeciderService.shouldPublishAd` → not a
 *      publish → return.
 *   6. Publish: `sendPhoto` when the ad has a local image, else
 *      `sendMessage`. The crypto-news adapter ignores the `chatId`, so
 *      pass `''`.
 *   7. Success: persist all four state transitions.
 *   8. Failure: increment failures (disable after 3) — and NEVER burn
 *      ads on a not-configured deploy (see `isNotConfiguredError`).
 */
@Injectable()
export class PublishAdUseCase {
  private readonly logger = new Logger(PublishAdUseCase.name);

  public constructor(
    private readonly adRepo: AdRepository,
    private readonly rotationConfigRepo: AdRotationConfigRepository,
    private readonly rotationStateRepo: AdRotationStateRepository,
    private readonly sharedThrottle: SharedThrottleSchedulerService,
    private readonly slotArbitrator: SlotArbitratorPort,
    private readonly decider: RotationDeciderService,
    private readonly publisher: TelegramPublisherPort,
  ) {}

  public async execute(now: Date = new Date()): Promise<void> {
    const cfg = await this.rotationConfigRepo.load();
    if (!cfg.enabled) {
      return;
    }

    const activeAds = await this.adRepo.findAllActive();
    if (activeAds.length === 0) {
      await this.rotationStateRepo.resetPostsSinceLastAd();
      return;
    }

    const slot = await this.slotArbitrator.canPublishNow('ads', now);
    if (!slot.canPublish) {
      this.logger.log(
        `slot blocked — next ad slot in ${slot.remainingSeconds}s`,
      );
      return;
    }

    const throttle = await this.sharedThrottle.shouldPublish(now);
    if (!throttle.canPublish) {
      this.logger.log(
        `ads throttle active — next publish in ${throttle.nextDelayMs}ms`,
      );
      return;
    }

    const state = await this.rotationStateRepo.load();
    const decision = await this.decider.shouldPublishAd(
      now,
      cfg,
      state,
      activeAds,
    );
    if (!decision.shouldPublish) {
      this.logger.log(`ads rotation decision: ${decision.reason}`);
      return;
    }

    const ad = decision.ad!;
    const result = ad.imagePath
      ? await this.publisher.sendPhoto('', ad.body, ad.imagePath)
      : await this.publisher.sendMessage('', ad.body);

    if (result.ok && result.messageId !== null) {
      await this.rotationStateRepo.markAdPublished(ad.id, now);
      await this.sharedThrottle.setLastPublishAt(now);
      await this.slotArbitrator.recordPublish('ads', now);
      await this.adRepo.markPublished(ad.id, String(result.messageId), now);
      this.logger.log(
        `published ad ${ad.id} as telegram message ${result.messageId}`,
      );
      return;
    }

    await this.handlePublishFailure(ad.id, result.error ?? 'unknown error');
  }

  /**
   * On a failed send, increment the ad's consecutive failure count and
   * disable it after 3 failures (operator must re-enable manually). The
   * rotation state is deliberately NOT advanced on failure — the ad
   * stays at the front of the rotation so the operator's fix is retried.
   */
  private async handlePublishFailure(
    adId: string,
    error: string,
  ): Promise<void> {
    // A misconfigured deploy (CRYPTO_NEWS_BOT_TOKEN / output channel
    // missing) must NOT burn an ad out. The adapter returns ok=false with
    // that exact message — it does not throw — so inspect the error
    // BEFORE any failure bookkeeping.
    if (this.isNotConfiguredError(error)) {
      this.logger.warn(
        `publisher not configured — leaving ad ${adId} enabled ` + `(${error})`,
      );
      return;
    }
    await this.adRepo.incrementFailures(adId);
    const after = await this.adRepo.findById(adId);
    if (after && after.consecutiveFailures >= 3) {
      await this.adRepo.disable(adId);
      this.logger.warn(`ad ${adId} disabled after 3 consecutive failures`);
    }
  }

  private isNotConfiguredError(msg: string): boolean {
    return (
      msg.includes('CRYPTO_NEWS_BOT_TOKEN') ||
      msg.includes('CRYPTO_NEWS_OUTPUT_CHANNEL')
    );
  }
}
