import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';
import {
  applyAdPatch,
  toAdView,
} from 'telegram/crypto-news-ads/application/mappers/ads.mapper';

describe('ads.mapper', () => {
  const NOW = new Date('2026-06-15T12:00:00.000Z');
  const PAST = new Date('2026-06-15T11:00:00.000Z');
  const FUTURE = new Date('2026-06-15T13:00:00.000Z');

  const buildAd = (
    overrides: {
      enabled?: boolean;
      expiresAt?: Date | null;
      expirationAction?: 'disable' | 'delete';
    } = {},
  ): Ad => {
    const created = Ad.create({
      name: 'Promo',
      body: 'Buy $X',
      expiresAt: overrides.expiresAt,
      expirationAction: overrides.expirationAction,
    });
    return overrides.enabled === false ? created.disable() : created;
  };

  describe('toAdView', () => {
    it('emits expiresAt as UTC ISO string when set, null otherwise', () => {
      const withExpiry = toAdView(buildAd({ expiresAt: FUTURE }));
      expect(withExpiry.expiresAt).toBe(FUTURE.toISOString());
      expect(withExpiry.expirationAction).toBe('disable');
      const without = toAdView(buildAd({ expiresAt: null }));
      expect(without.expiresAt).toBeNull();
      expect(without.expirationAction).toBe('disable');
    });

    it('carries expirationAction through the view', () => {
      const view = toAdView(
        buildAd({ expiresAt: FUTURE, expirationAction: 'delete' }),
      );
      expect(view.expirationAction).toBe('delete');
    });
  });

  describe('applyAdPatch — expiry invariant on the RESULTING ad (MA1)', () => {
    it('patches expiry fields via with() then enables through enable(now)', () => {
      const ad = buildAd({ expiresAt: null });
      const patched = applyAdPatch(
        ad,
        { expiresAt: FUTURE, expirationAction: 'delete' },
        NOW,
      );
      expect(patched.expiresAt).toEqual(FUTURE);
      expect(patched.expirationAction).toBe('delete');
      expect(patched.enabled).toBe(true);
    });

    it('throws DomainError CONFLICT when patch.enabled=true on an expired ad', () => {
      const ad = buildAd({ enabled: false, expiresAt: PAST });
      expect(() => applyAdPatch(ad, { enabled: true }, NOW)).toThrow(
        DomainError,
      );
      try {
        applyAdPatch(ad, { enabled: true }, NOW);
      } catch (err) {
        expect((err as DomainError).code).toBe(ErrorCode.CONFLICT);
      }
    });

    it('throws CONFLICT when changing ONLY expirationAction on an expired enabled ad (MA1 — not a renewal)', () => {
      const ad = buildAd({ enabled: true, expiresAt: PAST });
      expect(() =>
        applyAdPatch(ad, { expirationAction: 'delete' }, NOW),
      ).toThrow(DomainError);
    });

    it('allows renewal: enabled:true with a future expiresAt on an expired ad', () => {
      const ad = buildAd({ enabled: false, expiresAt: PAST });
      const renewed = applyAdPatch(
        ad,
        { enabled: true, expiresAt: FUTURE },
        NOW,
      );
      expect(renewed.enabled).toBe(true);
      expect(renewed.expiresAt).toEqual(FUTURE);
    });

    it('allows clearing expiry: expiresAt:null on an expired ad', () => {
      const ad = buildAd({ enabled: true, expiresAt: PAST });
      const cleared = applyAdPatch(ad, { expiresAt: null }, NOW);
      expect(cleared.enabled).toBe(true);
      expect(cleared.expiresAt).toBeNull();
    });

    it('does not 409 on enabled:false even when the ad is expired', () => {
      const ad = buildAd({ enabled: true, expiresAt: PAST });
      const disabled = applyAdPatch(ad, { enabled: false }, NOW);
      expect(disabled.enabled).toBe(false);
    });

    it('does not 409 on an empty patch for an enabled non-expired ad', () => {
      const ad = buildAd({ enabled: true, expiresAt: FUTURE });
      const unchanged = applyAdPatch(ad, {}, NOW);
      expect(unchanged.enabled).toBe(true);
      expect(unchanged.expiresAt).toEqual(FUTURE);
    });

    it('treats expiresAt:null as explicit clear vs undefined as unchanged', () => {
      const ad = buildAd({ enabled: true, expiresAt: FUTURE });
      const cleared = applyAdPatch(ad, { expiresAt: null }, NOW);
      expect(cleared.expiresAt).toBeNull();
      const untouched = applyAdPatch(ad, {}, NOW);
      expect(untouched.expiresAt).toEqual(FUTURE);
    });
  });
});
