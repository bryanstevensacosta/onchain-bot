import { RotationDeciderService } from '../rotation-decider.service';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import { AdRotationConfig } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-config.entity';
import { AdRotationState } from 'telegram/crypto-news-ads/domain/entities/ad-rotation-state.entity';

describe('RotationDeciderService', () => {
  let decider: RotationDeciderService;

  beforeEach(() => {
    decider = new RotationDeciderService();
  });

  function ad(id: string, order = 0): Ad {
    return Ad.create({ id, name: `Ad ${id}`, body: 'body', order });
  }

  function cfg(overrides?: {
    enabled?: boolean;
    everyNPosts?: number;
    minMinutesBetweenAds?: number;
  }): AdRotationConfig {
    return AdRotationConfig.empty().update({
      enabled: true,
      everyNPosts: 4,
      minMinutesBetweenAds: 30,
      ...overrides,
    });
  }

  describe('reason: no-active-ads', () => {
    it('returns no-active-ads when there are no active ads', async () => {
      const state = AdRotationState.empty();
      const decision = await decider.shouldPublishAd(
        new Date(),
        cfg(),
        state,
        [],
      );
      expect(decision).toEqual({
        shouldPublish: false,
        ad: null,
        reason: 'no-active-ads',
      });
    });
  });

  describe('reason: posts-not-met', () => {
    it('returns posts-not-met when postsSinceLastAd < everyNPosts', async () => {
      const ads = [ad('ad-1')];
      const state = AdRotationState.empty().incrementPostsSinceLastAd();
      const decision = await decider.shouldPublishAd(
        new Date(),
        cfg({ everyNPosts: 4 }),
        state,
        ads,
      );
      expect(decision).toEqual({
        shouldPublish: false,
        ad: null,
        reason: 'posts-not-met',
      });
    });

    it('publishes when postsSinceLastAd === everyNPosts', async () => {
      const ads = [ad('ad-1')];
      const stateAtThreshold = AdRotationState.fromSnapshot({
        id: 1,
        postsSinceLastAd: 4,
        lastAdId: null,
        lastAdPublishedAt: null,
        updatedAt: new Date(),
      });
      const decision = await decider.shouldPublishAd(
        new Date(),
        cfg({ everyNPosts: 4 }),
        stateAtThreshold,
        ads,
      );
      expect(decision.shouldPublish).toBe(true);
      expect(decision.ad?.id).toBe('ad-1');
      expect(decision.reason).toBe('ok');
    });
  });

  describe('reason: min-time-not-met', () => {
    it('blocks when last publish was within minMinutesBetweenAds', async () => {
      const ads = [ad('ad-1')];
      const last = new Date('2026-01-01T12:00:00Z');
      const state = AdRotationState.fromSnapshot({
        id: 1,
        postsSinceLastAd: 4,
        lastAdId: 'ad-1',
        lastAdPublishedAt: last,
        updatedAt: last,
      });
      const now = new Date('2026-01-01T12:20:00Z'); // 20min < 30min
      const decision = await decider.shouldPublishAd(now, cfg(), state, ads);
      expect(decision).toEqual({
        shouldPublish: false,
        ad: null,
        reason: 'min-time-not-met',
      });
    });

    it('allows when posts-met but time-not-met is satisfied', async () => {
      const ads = [ad('ad-1'), ad('ad-2')];
      const last = new Date('2026-01-01T12:00:00Z');
      const state = AdRotationState.fromSnapshot({
        id: 1,
        postsSinceLastAd: 4,
        lastAdId: 'ad-1',
        lastAdPublishedAt: last,
        updatedAt: last,
      });
      const now = new Date('2026-01-01T12:31:00Z'); // 31min >= 30min
      const decision = await decider.shouldPublishAd(now, cfg(), state, ads);
      expect(decision.shouldPublish).toBe(true);
      expect(decision.ad?.id).toBe('ad-2'); // wrap to next after ad-1
    });
  });

  describe('ad picking (wrap logic)', () => {
    it('picks the first ad on first-ever publish (lastAdId null)', async () => {
      const ads = [ad('ad-1'), ad('ad-2'), ad('ad-3')];
      const state = AdRotationState.fromSnapshot({
        id: 1,
        postsSinceLastAd: 4,
        lastAdId: null,
        lastAdPublishedAt: null,
        updatedAt: new Date(),
      });
      const decision = await decider.shouldPublishAd(
        new Date(),
        cfg(),
        state,
        ads,
      );
      expect(decision.ad?.id).toBe('ad-1');
    });

    it('wraps to the first ad when lastAdId was deleted', async () => {
      const ads = [ad('ad-5'), ad('ad-6')];
      const state = AdRotationState.fromSnapshot({
        id: 1,
        postsSinceLastAd: 4,
        lastAdId: 'deleted-ad',
        lastAdPublishedAt: new Date('2026-01-01T10:00:00Z'),
        updatedAt: new Date(),
      });
      const now = new Date('2026-01-01T12:00:00Z');
      const decision = await decider.shouldPublishAd(now, cfg(), state, ads);
      expect(decision.ad?.id).toBe('ad-5'); // falls back to first
    });

    it('wraps around from last element to first', async () => {
      const ads = [ad('ad-1'), ad('ad-2'), ad('ad-3')];
      const last = new Date('2026-01-01T10:00:00Z');
      const state = AdRotationState.fromSnapshot({
        id: 1,
        postsSinceLastAd: 4,
        lastAdId: 'ad-3', // last in list
        lastAdPublishedAt: last,
        updatedAt: last,
      });
      const decision = await decider.shouldPublishAd(
        new Date('2026-01-01T12:00:00Z'),
        cfg(),
        state,
        ads,
      );
      expect(decision.ad?.id).toBe('ad-1');
    });

    it('picks the next ad in order after lastAdId', async () => {
      const ads = [ad('ad-1'), ad('ad-2'), ad('ad-3')];
      const last = new Date('2026-01-01T10:00:00Z');
      const state = AdRotationState.fromSnapshot({
        id: 1,
        postsSinceLastAd: 4,
        lastAdId: 'ad-1',
        lastAdPublishedAt: last,
        updatedAt: last,
      });
      const decision = await decider.shouldPublishAd(
        new Date('2026-01-01T12:00:00Z'),
        cfg(),
        state,
        ads,
      );
      expect(decision.ad?.id).toBe('ad-2');
    });
  });
});
