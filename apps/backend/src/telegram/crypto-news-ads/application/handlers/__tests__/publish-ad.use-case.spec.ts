import { PublishAdUseCase } from '../publish-ad.use-case';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { AdRotationConfig } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-config.entity';
import { AdRotationState } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-state.entity';
import { AdRepository } from 'telegram/crypto-news-ads/application/ports/ad.repository';
import { AdRotationConfigRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-config.repository';
import { AdRotationStateRepository } from 'telegram/crypto-news-ads/application/ports/ad-rotation-state.repository';
import { AdMediaRepository } from 'telegram/crypto-news-ads/application/ports/ad-media.repository';
import { SharedThrottleSchedulerService } from 'telegram/shared/application/services/shared-throttle-scheduler.service';
import { SlotArbitratorPort } from 'telegram/shared/domain/ports/slot-arbitrator.port';
import { TelegramPublisherPort } from 'telegram/shared';
import { RotationDeciderService } from 'telegram/crypto-news-ads/application/services/rotation-decider.service';

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
const mockedExistsSync = fs.existsSync as jest.MockedFunction<
  typeof fs.existsSync
>;

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
  const publisher = {
    sendPhoto: jest.fn(),
    sendMessage: jest.fn(),
    sendVideo: jest.fn(),
    sendMediaGroup: jest.fn(),
  } as unknown as jest.Mocked<TelegramPublisherPort>;
  const adMediaRepo = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<AdMediaRepository>;
  const config = {
    getOrThrow: jest.fn(),
  } as unknown as jest.Mocked<ConfigService>;

  beforeEach(() => {
    jest.clearAllMocks();
    config.getOrThrow.mockReturnValue({ uploadsRoot: '/tmp/uploads' });
    useCase = new PublishAdUseCase(
      adRepo,
      cfgRepo,
      stateRepo,
      throttle,
      arbitrator,
      decider,
      publisher,
      adMediaRepo,
      config,
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
      expect(publisher.sendPhoto).not.toHaveBeenCalled();
      expect(publisher.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('empty active ads (α3-A resets)', () => {
    it('resets postsSinceLastAd and returns without publishing', async () => {
      cfgRepo.load.mockResolvedValue(enabledCfg());
      adRepo.findAllActive.mockResolvedValue([]);
      await useCase.execute();
      expect(stateRepo.resetPostsSinceLastAd).toHaveBeenCalled();
      expect(publisher.sendPhoto).not.toHaveBeenCalled();
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
      expect(publisher.sendPhoto).not.toHaveBeenCalled();
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
      expect(publisher.sendPhoto).not.toHaveBeenCalled();
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
      expect(publisher.sendPhoto).not.toHaveBeenCalled();
      expect(publisher.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('happy path', () => {
    it('publishes via sendPhoto with the resolved absolute path when the media row and file exist', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'promo',
        format: 'photo',
        imageMediaId: '3f4c8a56-2e6d-4e7a-8b9c-1d2e3f4a5b6c',
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
      adMediaRepo.findById.mockResolvedValue({
        id: '3f4c8a56-2e6d-4e7a-8b9c-1d2e3f4a5b6c',
        adId: 'ad-1',
        filePath: 'crypto-news-ads/ad-1/abc123.png',
        mimeType: 'image/png',
        fileSize: 1234,
        createdAt: now,
      });
      mockedExistsSync.mockReturnValue(true);
      publisher.sendPhoto.mockResolvedValue({
        ok: true,
        messageId: 42,
        error: null,
      });

      await useCase.execute(now);

      expect(publisher.sendPhoto).toHaveBeenCalledWith(
        '',
        'promo',
        path.join('/tmp/uploads', 'crypto-news-ads/ad-1/abc123.png'),
        { parseMode: 'HTML' },
      );
      expect(publisher.sendMessage).not.toHaveBeenCalled();
      expect(stateRepo.markAdPublished).toHaveBeenCalledWith('ad-1', now);
      expect(throttle.setLastPublishAt).toHaveBeenCalledWith(now);
      expect(arbitrator.recordPublish).toHaveBeenCalledWith('ads', now);
      expect(adRepo.markPublished).toHaveBeenCalledWith('ad-1', '42', now);
    });

    it('degrades to sendMessage + warn when the media row is missing', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'promo',
        format: 'photo',
        imageMediaId: '3f4c8a56-2e6d-4e7a-8b9c-1d2e3f4a5b6c',
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
      adMediaRepo.findById.mockResolvedValue(null);
      publisher.sendMessage.mockResolvedValue({
        ok: true,
        messageId: 7,
        error: null,
      });
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await useCase.execute(now);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        'promo',
        undefined,
        {
          parseMode: 'HTML',
        },
      );
      expect(publisher.sendPhoto).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no media'));
      expect(stateRepo.markAdPublished).toHaveBeenCalledWith('ad-1', now);
      warnSpy.mockRestore();
    });

    it('degrades to sendMessage + warn when the media file is missing from disk', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'promo',
        format: 'photo',
        imageMediaId: '3f4c8a56-2e6d-4e7a-8b9c-1d2e3f4a5b6c',
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
      adMediaRepo.findById.mockResolvedValue({
        id: '3f4c8a56-2e6d-4e7a-8b9c-1d2e3f4a5b6c',
        adId: 'ad-1',
        filePath: 'crypto-news-ads/ad-1/abc123.png',
        mimeType: 'image/png',
        fileSize: 1234,
        createdAt: now,
      });
      mockedExistsSync.mockReturnValue(false);
      publisher.sendMessage.mockResolvedValue({
        ok: true,
        messageId: 7,
        error: null,
      });
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await useCase.execute(now);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        'promo',
        undefined,
        {
          parseMode: 'HTML',
        },
      );
      expect(publisher.sendPhoto).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('file missing'),
      );
      expect(stateRepo.markAdPublished).toHaveBeenCalledWith('ad-1', now);
      warnSpy.mockRestore();
    });

    it('publishes without image via sendMessage', async () => {
      const ad = Ad.create({ id: 'ad-1', name: 'Sponsor', body: 'text only' });
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
      publisher.sendMessage.mockResolvedValue({
        ok: true,
        messageId: 7,
        error: null,
      });

      await useCase.execute(now);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        'text only',
        undefined,
        {
          parseMode: 'HTML',
        },
      );
      expect(publisher.sendPhoto).not.toHaveBeenCalled();
      expect(adMediaRepo.findById).not.toHaveBeenCalled();
    });

    it('publishes text via sendMessage and ignores imageMediaId (no media resolution)', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'text with image set',
        format: 'text',
        imageMediaId: '3f4c8a56-2e6d-4e7a-8b9c-1d2e3f4a5b6c',
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
      publisher.sendMessage.mockResolvedValue({
        ok: true,
        messageId: 7,
        error: null,
      });

      await useCase.execute(now);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        'text with image set',
        undefined,
        {
          parseMode: 'HTML',
        },
      );
      expect(publisher.sendPhoto).not.toHaveBeenCalled();
      // resolveMediaPath is private; its observable proxy is adMediaRepo.findById
      expect(adMediaRepo.findById).not.toHaveBeenCalled();
      expect(stateRepo.markAdPublished).toHaveBeenCalledWith('ad-1', now);
    });
  });

  describe('video format branch', () => {
    it('publishes via sendVideo with supportsStreaming when the video media row and file exist', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'watch this',
        format: 'video',
        videoMediaId: '3f4c8a56-2e6d-4e7a-8b9c-1d2e3f4a5b6c',
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
      adMediaRepo.findById.mockResolvedValue({
        id: '3f4c8a56-2e6d-4e7a-8b9c-1d2e3f4a5b6c',
        adId: 'ad-1',
        filePath: 'crypto-news-ads/ad-1/promo.mp4',
        mimeType: 'video/mp4',
        fileSize: 1234,
        createdAt: now,
      });
      mockedExistsSync.mockReturnValue(true);
      publisher.sendVideo.mockResolvedValue({
        ok: true,
        messageId: 43,
        error: null,
      });

      await useCase.execute(now);

      expect(publisher.sendVideo).toHaveBeenCalledWith(
        '',
        'watch this',
        path.join('/tmp/uploads', 'crypto-news-ads/ad-1/promo.mp4'),
        { parseMode: 'HTML', supportsStreaming: true },
      );
      expect(publisher.sendMessage).not.toHaveBeenCalled();
      expect(stateRepo.markAdPublished).toHaveBeenCalledWith('ad-1', now);
      expect(adRepo.markPublished).toHaveBeenCalledWith('ad-1', '43', now);
    });

    it('degrades to sendMessage when the video media row is missing', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'watch this',
        format: 'video',
        videoMediaId: '3f4c8a56-2e6d-4e7a-8b9c-1d2e3f4a5b6c',
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
      adMediaRepo.findById.mockResolvedValue(null);
      publisher.sendMessage.mockResolvedValue({
        ok: true,
        messageId: 7,
        error: null,
      });
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await useCase.execute(now);

      expect(publisher.sendMessage).toHaveBeenCalledWith(
        '',
        'watch this',
        undefined,
        { parseMode: 'HTML' },
      );
      expect(publisher.sendVideo).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no media'));
      expect(stateRepo.markAdPublished).toHaveBeenCalledWith('ad-1', now);
      warnSpy.mockRestore();
    });
  });

  describe('album format branch', () => {
    it('publishes via sendMediaGroup when every album media row and file exist', async () => {
      const ad = Ad.create({
        id: 'ad-1',
        name: 'Sponsor',
        body: 'gallery',
        format: 'album',
        albumMediaIds: ['img-a', 'img-b'],
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
      adMediaRepo.findById.mockImplementation(async (mediaId: string) => {
        if (mediaId === 'img-a') {
          return {
            id: 'img-a',
            adId: 'ad-1',
            filePath: 'crypto-news-ads/ad-1/a.png',
            mimeType: 'image/png',
            fileSize: 8,
            createdAt: now,
          };
        }
        if (mediaId === 'img-b') {
          return {
            id: 'img-b',
            adId: 'ad-1',
            filePath: 'crypto-news-ads/ad-1/b.png',
            mimeType: 'image/png',
            fileSize: 8,
            createdAt: now,
          };
        }
        return null;
      });
      mockedExistsSync.mockReturnValue(true);
      publisher.sendMediaGroup.mockResolvedValue({
        ok: true,
        messageId: 44,
        error: null,
      });

      await useCase.execute(now);

      expect(publisher.sendMediaGroup).toHaveBeenCalledWith(
        '',
        'gallery',
        [
          path.join('/tmp/uploads', 'crypto-news-ads/ad-1/a.png'),
          path.join('/tmp/uploads', 'crypto-news-ads/ad-1/b.png'),
        ],
        { parseMode: 'HTML' },
      );
      expect(publisher.sendMessage).not.toHaveBeenCalled();
      expect(stateRepo.markAdPublished).toHaveBeenCalledWith('ad-1', now);
      expect(adRepo.markPublished).toHaveBeenCalledWith('ad-1', '44', now);
    });

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
      adMediaRepo.findById.mockImplementation(async (mediaId: string) => {
        if (mediaId === 'img-a') {
          return {
            id: 'img-a',
            adId: 'ad-1',
            filePath: 'crypto-news-ads/ad-1/a.png',
            mimeType: 'image/png',
            fileSize: 8,
            createdAt: now,
          };
        }
        return null;
      });
      mockedExistsSync.mockReturnValue(true);
      publisher.sendMediaGroup.mockResolvedValue({
        ok: true,
        messageId: 44,
        error: null,
      });
      adRepo.findById.mockResolvedValue(ads(1, { consecutiveFailures: 1 })[0]);

      await useCase.execute(now);

      expect(publisher.sendMediaGroup).not.toHaveBeenCalled();
      expect(publisher.sendMessage).not.toHaveBeenCalled();
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
      publisher.sendMessage.mockResolvedValue({
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
      publisher.sendMessage.mockResolvedValue({
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
      publisher.sendMessage.mockResolvedValue({
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
      expect(publisher.sendPhoto).not.toHaveBeenCalled();
      expect(publisher.sendMessage).not.toHaveBeenCalled();
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
      publisher.sendMessage.mockResolvedValue({
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
      expect(publisher.sendMessage).toHaveBeenCalledWith('', 'b2', undefined, {
        parseMode: 'HTML',
      });
    });
  });
});
