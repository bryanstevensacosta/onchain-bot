import { DomainError } from 'shared/kernel/domain-error';
import { TrackedPublishedCall } from './tracked-published-call.entity';

describe('TrackedPublishedCall', () => {
  const baseInput = {
    kolId: 'kol_spydefi',
    chain: 'solana',
    address: 'So11111111111111111111111111111111111111112',
    ticker: 'WIF',
    mcAtPublish: 100_000,
    publishedAt: new Date('2026-06-24T10:00:00Z'),
  };

  describe('create', () => {
    it('builds the expected id from chain + address', () => {
      const t = TrackedPublishedCall.create(baseInput);
      expect(t.id).toBe('solana:so11111111111111111111111111111111111111112');
    });

    it('initializes milestonesHit to [] and priceDropPercent to null', () => {
      const t = TrackedPublishedCall.create(baseInput);
      expect(t.milestonesHit).toEqual([]);
      expect(t.maxMilestone).toBeNull();
      expect(t.priceDropPercent).toBeNull();
      expect(t.mcNow).toBeNull();
    });

    it('marks isActive=true and sets lastUpdatedAt to publishedAt', () => {
      const t = TrackedPublishedCall.create(baseInput);
      expect(t.isActive).toBe(true);
      expect(t.lastUpdatedAt).toEqual(baseInput.publishedAt);
    });

    it('throws VALIDATION when chain is empty', () => {
      expect(() =>
        TrackedPublishedCall.create({ ...baseInput, chain: '' }),
      ).toThrow(DomainError);
    });

    it('throws VALIDATION when address is empty', () => {
      expect(() =>
        TrackedPublishedCall.create({ ...baseInput, address: '' }),
      ).toThrow(DomainError);
    });

    it('throws VALIDATION when kolId is empty', () => {
      expect(() =>
        TrackedPublishedCall.create({ ...baseInput, kolId: '' }),
      ).toThrow(DomainError);
    });

    it('throws VALIDATION when mcAtPublish is negative', () => {
      expect(() =>
        TrackedPublishedCall.create({ ...baseInput, mcAtPublish: -1 }),
      ).toThrow(DomainError);
    });

    it('throws VALIDATION when mcAtPublish is not finite', () => {
      expect(() =>
        TrackedPublishedCall.create({
          ...baseInput,
          mcAtPublish: Number.POSITIVE_INFINITY,
        }),
      ).toThrow(DomainError);
    });

    it('accepts ticker=null', () => {
      const t = TrackedPublishedCall.create({ ...baseInput, ticker: null });
      expect(t.ticker).toBeNull();
    });
  });

  describe('applyTrackingSnapshot', () => {
    it('updates mcNow, milestonesHit, maxMilestone, priceDropPercent, lastUpdatedAt', () => {
      const t = TrackedPublishedCall.create(baseInput);
      const at = new Date('2026-06-24T11:00:00Z');
      t.applyTrackingSnapshot({ mcNow: 250_000, milestonesHit: [2, 3], at });
      expect(t.mcNow).toBe(250_000);
      expect(t.milestonesHit).toEqual([2, 3]);
      expect(t.maxMilestone).toBe(3);
      expect(t.priceDropPercent).toBe(150);
      expect(t.lastUpdatedAt).toEqual(at);
    });

    it('sorts milestonesHit ascending', () => {
      const t = TrackedPublishedCall.create(baseInput);
      t.applyTrackingSnapshot({
        mcNow: 300_000,
        milestonesHit: [5, 2, 3],
        at: new Date(),
      });
      expect(t.milestonesHit).toEqual([2, 3, 5]);
      expect(t.maxMilestone).toBe(5);
    });

    it('computes negative priceDropPercent on price drop', () => {
      const t = TrackedPublishedCall.create(baseInput);
      t.applyTrackingSnapshot({
        mcNow: 10_000,
        milestonesHit: [],
        at: new Date(),
      });
      expect(t.priceDropPercent).toBe(-90);
    });

    it('keeps priceDropPercent null when mcAtPublish is 0', () => {
      const t = TrackedPublishedCall.create({ ...baseInput, mcAtPublish: 0 });
      t.applyTrackingSnapshot({
        mcNow: 1000,
        milestonesHit: [],
        at: new Date(),
      });
      expect(t.priceDropPercent).toBeNull();
    });

    it('keeps priceDropPercent null when mcNow is null', () => {
      const t = TrackedPublishedCall.create(baseInput);
      t.applyTrackingSnapshot({
        mcNow: null,
        milestonesHit: [],
        at: new Date(),
      });
      expect(t.priceDropPercent).toBeNull();
      expect(t.maxMilestone).toBeNull();
    });
  });

  describe('deactivate', () => {
    it('sets isActive=false and updates lastUpdatedAt to a new (later or equal) value', () => {
      const t = TrackedPublishedCall.create({
        ...baseInput,
        publishedAt: new Date('2020-01-01T00:00:00Z'),
      });
      const before = t.lastUpdatedAt.getTime();
      t.deactivate();
      expect(t.isActive).toBe(false);
      expect(t.lastUpdatedAt.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('rehydrate', () => {
    it('restores all fields from props', () => {
      const now = new Date();
      const rehydrated = TrackedPublishedCall.rehydrate({
        kolId: 'kol_x',
        chain: 'ethereum',
        address: '0xabc',
        ticker: 'TKN',
        mcAtPublish: 1234,
        mcNow: 5678,
        milestonesHit: [2, 5],
        maxMilestone: 5,
        priceDropPercent: 360,
        publishedAt: new Date('2026-01-01T00:00:00Z'),
        lastUpdatedAt: now,
        isActive: false,
      });
      expect(rehydrated.id).toBe('ethereum:0xabc');
      expect(rehydrated.mcNow).toBe(5678);
      expect(rehydrated.maxMilestone).toBe(5);
      expect(rehydrated.isActive).toBe(false);
    });
  });

  describe('buildId', () => {
    it('lowercases the address', () => {
      expect(TrackedPublishedCall.buildId('solana', 'ABC')).toBe('solana:abc');
    });
  });
});
