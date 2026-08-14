import { DomainError, ErrorCode } from 'shared/kernel/domain-error';
import { Ad } from 'telegram/crypto-news-ads/domain/entities/ad.entity';

describe('Ad', () => {
  // Fixed dates keep tests deterministic — never use `new Date()` inside assertions.
  const NOW = new Date('2026-06-15T12:00:00.000Z');
  const PAST = new Date('2026-06-15T11:00:00.000Z');
  const FUTURE = new Date('2026-06-15T13:00:00.000Z');

  describe('create() — expiry defaults', () => {
    it('defaults expiresAt to null when omitted', () => {
      const ad = Ad.create({ name: 'Promo', body: 'Buy $X' });
      expect(ad.expiresAt).toBeNull();
    });

    it('defaults expirationAction to "disable" when omitted', () => {
      const ad = Ad.create({ name: 'Promo', body: 'Buy $X' });
      expect(ad.expirationAction).toBe('disable');
    });

    it('accepts an explicit expiresAt and exposes it via getter', () => {
      const ad = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        expiresAt: FUTURE,
      });
      expect(ad.expiresAt).toEqual(FUTURE);
    });

    it('accepts an explicit expirationAction of "delete"', () => {
      const ad = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        expiresAt: FUTURE,
        expirationAction: 'delete',
      });
      expect(ad.expirationAction).toBe('delete');
    });

    it('treats expiresAt: null as an explicit null (still null)', () => {
      const ad = Ad.create({ name: 'Promo', body: 'Buy $X', expiresAt: null });
      expect(ad.expiresAt).toBeNull();
    });
  });

  describe('isExpired() — boundary semantics', () => {
    it('returns false when expiresAt is null (no expiry configured)', () => {
      const ad = Ad.create({ name: 'Promo', body: 'Buy $X' });
      expect(ad.isExpired(NOW)).toBe(false);
    });

    it('returns true when expiresAt is strictly in the past', () => {
      const ad = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        expiresAt: PAST,
      });
      expect(ad.isExpired(NOW)).toBe(true);
    });

    it('returns true when expiresAt is exactly equal to now (inclusive boundary)', () => {
      const ad = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        expiresAt: new Date(NOW.getTime()),
      });
      expect(ad.isExpired(NOW)).toBe(true);
    });

    it('returns false when expiresAt is strictly in the future', () => {
      const ad = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        expiresAt: FUTURE,
      });
      expect(ad.isExpired(NOW)).toBe(false);
    });
  });

  describe('enable() — expiry invariant', () => {
    it('throws DomainError CONFLICT when enabling an ad whose expiresAt is in the past', () => {
      const ad = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        expiresAt: PAST,
      });
      let caught: unknown;
      try {
        ad.enable(NOW);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(DomainError);
      expect((caught as DomainError).code).toBe(ErrorCode.CONFLICT);
      expect((caught as DomainError).message).toBe(
        'ad Promo is expired — set a future expiry or clear it to re-enable',
      );
    });

    it('throws DomainError CONFLICT when expiresAt equals now (inclusive boundary)', () => {
      const ad = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        expiresAt: new Date(NOW.getTime()),
      });
      expect(() => ad.enable(NOW)).toThrow(DomainError);
    });

    it('returns a new enabled Ad when expiry is in the future and explicit now is provided', () => {
      const ad = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        expiresAt: FUTURE,
      });
      const enabled = ad.enable(NOW);
      expect(enabled).not.toBe(ad);
      expect(enabled.enabled).toBe(true);
      expect(enabled.expiresAt).toEqual(FUTURE);
    });

    it('returns a new enabled Ad when expiresAt is null (no expiry)', () => {
      const ad = Ad.create({ name: 'Promo', body: 'Buy $X' });
      const enabled = ad.enable(NOW);
      expect(enabled.enabled).toBe(true);
      expect(enabled.expiresAt).toBeNull();
    });
  });

  describe('clearExpiry()', () => {
    it('sets expiresAt back to null on an ad with a configured expiry', () => {
      const ad = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        expiresAt: FUTURE,
      });
      const cleared = ad.clearExpiry();
      expect(cleared.expiresAt).toBeNull();
      expect(cleared.expirationAction).toBe('disable');
    });

    it('returns a new instance (immutability)', () => {
      const ad = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        expiresAt: FUTURE,
      });
      const cleared = ad.clearExpiry();
      expect(cleared).not.toBe(ad);
      expect(ad.expiresAt).toEqual(FUTURE);
    });
  });

  describe('create() — format defaults', () => {
    it('defaults format to "text" when omitted', () => {
      const ad = Ad.create({ name: 'Promo', body: 'Buy $X' });
      expect(ad.format).toBe('text');
      expect(ad.videoMediaId).toBeNull();
      expect(ad.albumMediaIds).toBeNull();
    });

    it('accepts an explicit format and exposes it via getter', () => {
      const ad = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        format: 'video',
        videoMediaId: 'vid-1',
      });
      expect(ad.format).toBe('video');
      expect(ad.videoMediaId).toBe('vid-1');
    });

    it('throws DomainError VALIDATION for an invalid format', () => {
      let caught: unknown;
      try {
        Ad.create({
          name: 'Promo',
          body: 'Buy $X',
          format: 'carousel' as never,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(DomainError);
      expect((caught as DomainError).code).toBe(ErrorCode.VALIDATION);
      expect((caught as DomainError).message).toContain(
        'ad format must be one of: text, photo, video, album',
      );
    });
  });

  describe('validateInvariants() — per-format media requirements', () => {
    it('throws DomainError VALIDATION when format "photo" has no imageMediaId', () => {
      let caught: unknown;
      try {
        Ad.create({ name: 'Promo', body: 'Buy $X', format: 'photo' });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(DomainError);
      expect((caught as DomainError).code).toBe(ErrorCode.VALIDATION);
      expect((caught as DomainError).message).toContain(
        "format 'photo' requires imageMediaId",
      );
    });

    it('accepts format "photo" when imageMediaId is present', () => {
      const ad = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        format: 'photo',
        imageMediaId: 'img-1',
      });
      expect(ad.format).toBe('photo');
      expect(ad.imageMediaId).toBe('img-1');
    });

    it('throws DomainError VALIDATION when format "video" has no videoMediaId', () => {
      let caught: unknown;
      try {
        Ad.create({ name: 'Promo', body: 'Buy $X', format: 'video' });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(DomainError);
      expect((caught as DomainError).code).toBe(ErrorCode.VALIDATION);
      expect((caught as DomainError).message).toContain(
        "format 'video' requires videoMediaId",
      );
    });

    it('accepts format "video" when videoMediaId is present', () => {
      const ad = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        format: 'video',
        videoMediaId: 'vid-1',
      });
      expect(ad.format).toBe('video');
      expect(ad.videoMediaId).toBe('vid-1');
    });

    it('throws DomainError VALIDATION when format "album" has no albumMediaIds', () => {
      let caught: unknown;
      try {
        Ad.create({ name: 'Promo', body: 'Buy $X', format: 'album' });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(DomainError);
      expect((caught as DomainError).code).toBe(ErrorCode.VALIDATION);
      expect((caught as DomainError).message).toContain(
        "format 'album' requires at least one albumMediaId",
      );
    });

    it('throws DomainError VALIDATION when format "album" has an empty albumMediaIds array', () => {
      let caught: unknown;
      try {
        Ad.create({
          name: 'Promo',
          body: 'Buy $X',
          format: 'album',
          albumMediaIds: [],
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(DomainError);
      expect((caught as DomainError).code).toBe(ErrorCode.VALIDATION);
    });

    it('accepts format "album" when albumMediaIds has at least one id', () => {
      const ad = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        format: 'album',
        albumMediaIds: ['img-1', 'img-2'],
      });
      expect(ad.format).toBe('album');
      expect(ad.albumMediaIds).toEqual(['img-1', 'img-2']);
    });
  });

  describe('fromSnapshot()', () => {
    it('round-trips expiresAt and expirationAction through the snapshot path', () => {
      const original = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        expiresAt: FUTURE,
        expirationAction: 'delete',
      });
      const snapshot = {
        id: original.id,
        name: original.name,
        body: original.body,
        imageMediaId: original.imageMediaId,
        enabled: original.enabled,
        order: original.order,
        timesPublished: original.timesPublished,
        consecutiveFailures: original.consecutiveFailures,
        lastPublishedAt: original.lastPublishedAt,
        expiresAt: original.expiresAt,
        expirationAction: original.expirationAction,
        createdAt: original.createdAt,
        updatedAt: original.updatedAt,
      };
      const restored = Ad.fromSnapshot(snapshot);
      expect(restored.expiresAt).toEqual(FUTURE);
      expect(restored.expirationAction).toBe('delete');
    });

    it('defaults format to "text", videoMediaId and albumMediaIds to null when omitted (legacy rows)', () => {
      const restored = Ad.fromSnapshot({
        id: 'ad-1',
        name: 'Legacy',
        body: 'old',
        imageMediaId: null,
        enabled: true,
        order: 0,
        timesPublished: 0,
        consecutiveFailures: 0,
        lastPublishedAt: null,
        expiresAt: null,
        expirationAction: 'disable',
        createdAt: NOW,
        updatedAt: NOW,
      });
      expect(restored.format).toBe('text');
      expect(restored.videoMediaId).toBeNull();
      expect(restored.albumMediaIds).toBeNull();
    });

    it('round-trips format, videoMediaId and albumMediaIds through the snapshot path', () => {
      const original = Ad.create({
        name: 'Promo',
        body: 'Buy $X',
        format: 'album',
        albumMediaIds: ['img-1', 'img-2'],
      });
      const snapshot = {
        id: original.id,
        name: original.name,
        body: original.body,
        imageMediaId: original.imageMediaId,
        format: original.format,
        videoMediaId: original.videoMediaId,
        albumMediaIds: original.albumMediaIds,
        enabled: original.enabled,
        order: original.order,
        timesPublished: original.timesPublished,
        consecutiveFailures: original.consecutiveFailures,
        lastPublishedAt: original.lastPublishedAt,
        expiresAt: original.expiresAt,
        expirationAction: original.expirationAction,
        createdAt: original.createdAt,
        updatedAt: original.updatedAt,
      };
      const restored = Ad.fromSnapshot(snapshot);
      expect(restored.format).toBe('album');
      expect(restored.albumMediaIds).toEqual(['img-1', 'img-2']);
    });
  });
});
