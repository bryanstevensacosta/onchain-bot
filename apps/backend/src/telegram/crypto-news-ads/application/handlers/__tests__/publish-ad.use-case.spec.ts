import { PublishAdUseCase } from '../publish-ad.use-case';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { AdRotationConfig } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-config.entity';
import { AdRotationState } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-state.entity';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import { AdRotationConfigRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-config.repository';
import { AdRotationStateRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-state.repository';
import { SharedThrottleSchedulerService } from 'telegram/shared/application/services/shared-throttle-scheduler.service';
import { SlotArbitratorPort } from 'telegram/shared/domain/ports/slot-arbitrator.port';
import { RotationDeciderService } from 'telegram/crypto-news-ads/application/services/rotation-decider.service';
import { AdFormatPublisherService } from 'telegram/crypto-news-ads/application/services/ad-format-publisher.service';

// Mock existsSync so media-present / media-missing-from-disk branches
// run without touching real disk. jest.mock is hoisted above imports,
// so the mocked existsSync is in place before the use case is required.
// Node exposes `existsSync` as a non-configurable getter — jest.spyOn
// cannot redefine it, so the partial-module-mock pattern is required
// (mirrors media-retention-cleanup.scheduler.spec.ts:9-19).
jest.mock('node:fs', () => {
  const actual = jest.requireActual('node:fs') as unknown as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    existsSync: jest.fn(),
  };
});

describe('PublishAdUseCase', () => {
  let useCase: PublishAdUseCase;
  const adRepo = {
    findAllActive: jest.fn(),
    findExpired: jest.fn(),
    incrementFailures: jest.fn(),
    findById: jest.fn(),
    disable: jest.fn(),
    markPublished: jest.fn(),
  } as unknown as jest.Mocked<AdRepository>;
  const cfgRepo = {
    load: jest.fn(),
  } as unknown as jest.Mocked<AdRotationConfigRepository>;
  const stateRepo = {
    load: jest.fn(),
    resetPostsSinceLastAd: jest.fn(),
    markAdPublished: jest.fn(),
  } as unknown as jest.Mocked<AdRotationStateRepository>;
  const throttle = {
    shouldPublish: jest.fn(),
    setLastPublishAt: jest.fn(),
  } as unknown as jest.Mocked<SharedThrottleSchedulerService>;
  const arbitrator = {
    canPublishNow: jest.fn(),
    recordPublish: jest.fn(),
  } as unknown as jest.Mocked<SlotArbitratorPort>;
  const decider = {
    shouldPublishAd: jest.fn(),
  } as unknown as jest.Mocked<RotationDeciderService>;
  const adFormatPublisher = {
    publish: jest.fn(),
  } as unknown as jest.Mocked<AdFormatPublisherService>;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new PublishAdUseCase(
      adRepo,
      cfgRepo,
      stateRepo,
      throttle,
      arbitrator,
      decider,
      adFormatPublisher,
    );
  });

  function enabledCfg(): AdRotationConfig {
    return AdRotationConfig.empty().update({ enabled: true, everyNPosts: 4 });
  }

  function ads(n: number, overrides?: { consecutiveFailures?: number }): Ad[] {
    const list: Ad[] = [];
    for (let i = 1; i <= n; i++) {
      let a = Ad.create({ id: `ad-${i}`, name: `Ad ${i}`, body: `body ${i}` });
      if (overrides?.consecutiveFailures !== undefined) {
        a = Ad.fromSnapshot({
          id: a.id,
          name: a.name,
          body: a.body,
          imageMediaId: a.imageMediaId,
          enabled: a.enabled,
          order: a.order,
          timesPublished: a.timesPublished,
          consecutiveFailures: overrides.consecutiveFailures,
          lastPublishedAt: a.lastPublishedAt,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
        });
      }
      list.push(a);
    }
    return list;
  }

  describe('master switch', () => {
    it('returns without calling anything when rotation is disabled', async () => {
      cfgRepo.load.mockResolvedValue(AdRotationConfig.empty());
      await useCase.execute();
      expect(adRepo.findAllActive).not.toHaveBeenCalled();
      expect(decider.shouldPublishAd).not.toHaveBeenCalled();
      expect(adFormatPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('empty active ads (α3-A resets)', () => {
    it('resets postsSinceLastAd and returns without publishing', async () => {
      cfgRepo.load.mockResolvedValue(enabledCfg());
      adRepo.findAllActive.mockResolvedValue([]);
      await useCase.execute();
      expect(stateRepo.resetPostsSinceLastAd).toHaveBeenCalled();
      expect(adFormatPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('slot gate', () => {
    it('returns without publishing when the slot is blocked', async () => {
      cfgRepo.load.mockResolvedValue(enabledCfg());
      adRepo.findAllActive.mockResolvedValue(ads(1));
      arbitrator.canPublishNow.mockResolvedValue({
        canPublish: false,
        nextSlotAvailableAt: new Date(),
        remainingSeconds: 30,
        lastScope: 'news',
        reason: 'min-gap-not-met',
      });
      await useCase.execute();
      expect(throttle.shouldPublish).not.toHaveBeenCalled();
      expect(adFormatPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('throttle gate', () => {
    it('returns without publishing when the throttle is active', async () => {
      cfgRepo.load.mockResolvedValue(enabledCfg());
      adRepo.findAllActive.mockResolvedValue(ads(1));
      arbitrator.canPublishNow.mockResolvedValue({
        canPublish: true,
        nextSlotAvailableAt: null,
        remainingSeconds: 0,
        lastScope: null,
        reason: 'ok',
      });
      throttle.shouldPublish.mockResolvedValue({
        canPublish: false,
        nextDelayMs: 120000,
      });
      await useCase.execute();
      expect(decider.shouldPublishAd).not.toHaveBeenCalled();
      expect(adFormatPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('decision gate', () => {
    it('returns without publishing when the decider says posts-not-met', async () => {
      cfgRepo.load.mockResolvedValue(enabledCfg());
      adRepo.findAllActive.mockResolvedValue(ads(1));
      arbitrator.canPublishNow.mockResolvedValue({
        canPublish: true,
        nextSlotAvailableAt: null,
        remainingSeconds: 0,
        lastScope: null,
        reason: 'ok',
      });
      throttle.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      stateRepo.load.mockResolvedValue(AdRotationState.empty());
      decider.shouldPublishAd.mockResolvedValue({
        shouldPublish: false,
        ad: null,
        reason: 'posts-not-met',
      });
      await useCase.execute();
      expect(adFormatPublisher.publish).not.toHaveBeenCalled();
    });
  });

  describe('album format branch', () => {
    it('skips the publish and routes to failure handling when an album media row is missing', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'gallery',
        format: 'album',
        albumMediaIds: ['img-a', 'img-missing'],
      });
      const now = new Date('2026-01-01T12:00:00Z');
      cfgRepo.load.mockResolvedValue(enabledCfg());
      adRepo.findAllActive.mockResolvedValue([ad]);
      arbitrator.canPublishNow.mockResolvedValue({
        canPublish: true,
        nextSlotAvailableAt: null,
        remainingSeconds: 0,
        lastScope: null,
        reason: 'ok',
      });
      throttle.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      stateRepo.load.mockResolvedValue(AdRotationState.empty());
      decider.shouldPublishAd.mockResolvedValue({
        shouldPublish: true,
        ad,
        reason: 'ok',
      });
      adFormatPublisher.publish.mockResolvedValue({
        ok: false,
        messageId: null,
        error: 'ad ad-1 album media missing — skipping',
      });
      adRepo.findById.mockResolvedValue(ads(1, { consecutiveFailures: 1 })[0]);

      await useCase.execute(now);

      expect(adFormatPublisher.publish).toHaveBeenCalledWith(ad);
      expect(adRepo.incrementFailures).toHaveBeenCalledWith(ad.id);
      expect(stateRepo.markAdPublished).not.toHaveBeenCalled();
      expect(throttle.setLastPublishAt).not.toHaveBeenCalled();
      expect(arbitrator.recordPublish).not.toHaveBeenCalled();
    });
  });

  describe('failure path', () => {
    it('increments failures only; rotation state untouched; below threshold no disable', async () => {
      const ad = ads(1)[0];
      cfgRepo.load.mockResolvedValue(enabledCfg());
      adRepo.findAllActive.mockResolvedValue([ad]);
      arbitrator.canPublishNow.mockResolvedValue({
        canPublish: true,
        nextSlotAvailableAt: null,
        remainingSeconds: 0,
        lastScope: null,
        reason: 'ok',
      });
      throttle.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      stateRepo.load.mockResolvedValue(AdRotationState.empty());
      decider.shouldPublishAd.mockResolvedValue({
        shouldPublish: true,
        ad,
        reason: 'ok',
      });
      adFormatPublisher.publish.mockResolvedValue({
        ok: false,
        messageId: null,
        error: 'telegram down',
      });
      adRepo.findById.mockResolvedValue(ads(1, { consecutiveFailures: 1 })[0]);

      await useCase.execute();

      expect(adRepo.incrementFailures).toHaveBeenCalledWith(ad.id);
      expect(adRepo.disable).not.toHaveBeenCalled();
      expect(stateRepo.markAdPublished).not.toHaveBeenCalled();
      expect(throttle.setLastPublishAt).not.toHaveBeenCalled();
      expect(arbitrator.recordPublish).not.toHaveBeenCalled();
    });

    it('disables the ad when it hits 3 consecutive failures', async () => {
      const ad = ads(1)[0];
      cfgRepo.load.mockResolvedValue(enabledCfg());
      adRepo.findAllActive.mockResolvedValue([ad]);
      arbitrator.canPublishNow.mockResolvedValue({
        canPublish: true,
        nextSlotAvailableAt: null,
        remainingSeconds: 0,
        lastScope: null,
        reason: 'ok',
      });
      throttle.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      stateRepo.load.mockResolvedValue(AdRotationState.empty());
      decider.shouldPublishAd.mockResolvedValue({
        shouldPublish: true,
        ad,
        reason: 'ok',
      });
      adFormatPublisher.publish.mockResolvedValue({
        ok: false,
        messageId: null,
        error: 'telegram down',
      });
      // after incrementFailures, the ad now has 3 failures
      adRepo.findById.mockResolvedValue(ads(1, { consecutiveFailures: 3 })[0]);

      await useCase.execute();

      expect(adRepo.disable).toHaveBeenCalledWith(ad.id);
      expect(stateRepo.markAdPublished).not.toHaveBeenCalled();
    });

    it('not-configured error → no incrementFailures, no disable, nothing persisted', async () => {
      const ad = ads(1)[0];
      cfgRepo.load.mockResolvedValue(enabledCfg());
      adRepo.findAllActive.mockResolvedValue([ad]);
      arbitrator.canPublishNow.mockResolvedValue({
        canPublish: true,
        nextSlotAvailableAt: null,
        remainingSeconds: 0,
        lastScope: null,
        reason: 'ok',
      });
      throttle.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      stateRepo.load.mockResolvedValue(AdRotationState.empty());
      decider.shouldPublishAd.mockResolvedValue({
        shouldPublish: true,
        ad,
        reason: 'ok',
      });
      adFormatPublisher.publish.mockResolvedValue({
        ok: false,
        messageId: null,
        error: 'CRYPTO_NEWS_BOT_TOKEN missing from env',
      });

      await useCase.execute();

      expect(adRepo.incrementFailures).not.toHaveBeenCalled();
      expect(adRepo.disable).not.toHaveBeenCalled();
      expect(stateRepo.markAdPublished).not.toHaveBeenCalled();
      expect(throttle.setLastPublishAt).not.toHaveBeenCalled();
      expect(arbitrator.recordPublish).not.toHaveBeenCalled();
    });
  });

  describe('expired ads (repo-level primary guard)', () => {
    it('all-active-ads-expired → findAllActive(now) empty → resets + no publish', async () => {
      const now = new Date('2026-01-01T12:00:00Z');
      cfgRepo.load.mockResolvedValue(enabledCfg());
      // the repo filter (T2) already excluded every expired ad
      adRepo.findAllActive.mockResolvedValue([]);

      await useCase.execute(now);

      expect(adRepo.findAllActive).toHaveBeenCalledWith(now);
      expect(stateRepo.resetPostsSinceLastAd).toHaveBeenCalled();
      expect(adFormatPublisher.publish).not.toHaveBeenCalled();
    });

    it('mixed → decider receives only the non-expired ads, publish picks one', async () => {
      const now = new Date('2026-01-01T12:00:00Z');
      const active = [
        Ad.create({ id: 'ad-1', name: 'Ad 1', body: 'b1' }),
        Ad.create({ id: 'ad-2', name: 'Ad 2', body: 'b2' }),
      ];
      const cfg = enabledCfg();
      cfgRepo.load.mockResolvedValue(cfg);
      // an expired ad-3 would never appear here — the repo excluded it
      adRepo.findAllActive.mockResolvedValue(active);
      arbitrator.canPublishNow.mockResolvedValue({
        canPublish: true,
        nextSlotAvailableAt: null,
        remainingSeconds: 0,
        lastScope: null,
        reason: 'ok',
      });
      throttle.shouldPublish.mockResolvedValue({
        canPublish: true,
        nextDelayMs: 0,
      });
      const state = AdRotationState.empty();
      stateRepo.load.mockResolvedValue(state);
      decider.shouldPublishAd.mockResolvedValue({
        shouldPublish: true,
        ad: active[1],
        reason: 'ok',
      });
      adFormatPublisher.publish.mockResolvedValue({
        ok: true,
        messageId: 5,
        error: null,
      });

      await useCase.execute(now);

      expect(adRepo.findAllActive).toHaveBeenCalledWith(now);
      // the rotation decision sees exactly the repo-filtered list
      expect(decider.shouldPublishAd).toHaveBeenCalledWith(
        now,
        cfg,
        state,
        active,
      );
      expect(adFormatPublisher.publish).toHaveBeenCalledWith(active[1]);
    });
  });
});
