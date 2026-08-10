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
  });
});
