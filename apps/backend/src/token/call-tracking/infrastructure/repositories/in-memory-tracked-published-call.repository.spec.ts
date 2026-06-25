import { InMemoryTrackedPublishedCallRepository } from './in-memory-tracked-published-call.repository';
import { TrackedPublishedCallRecord } from '../../application/ports/tracked-published-call.repository';

function makeRecord(
  chain: string,
  address: string,
  overrides: Partial<TrackedPublishedCallRecord> = {},
): TrackedPublishedCallRecord {
  return {
    id: `${chain}:${address.toLowerCase()}`,
    kolId: 'kol_x',
    chain,
    address: address.toLowerCase(),
    ticker: 'TKN',
    mcAtPublish: 1000,
    mcNow: null,
    milestonesHit: [],
    maxMilestone: null,
    priceDropPercent: null,
    publishedAt: new Date(),
    lastUpdatedAt: new Date(),
    isActive: true,
    ...overrides,
  };
}

describe('InMemoryTrackedPublishedCallRepository', () => {
  let repo: InMemoryTrackedPublishedCallRepository;

  beforeEach(() => {
    repo = new InMemoryTrackedPublishedCallRepository();
  });

  it('saves and finds by chain+address', async () => {
    const r = makeRecord('solana', 'ABC');
    await repo.save(r);
    const found = await repo.findByChainAndAddress('solana', 'abc');
    expect(found?.kolId).toBe('kol_x');
  });

  it('returns null for unknown chain+address', async () => {
    expect(await repo.findByChainAndAddress('solana', 'unknown')).toBeNull();
  });

  it('save is idempotent on (chain, address)', async () => {
    await repo.save(makeRecord('solana', 'abc', { mcNow: 1000 }));
    await repo.save(makeRecord('solana', 'abc', { mcNow: 2000 }));
    const found = await repo.findByChainAndAddress('solana', 'abc');
    expect(found?.mcNow).toBe(2000);
    expect((await repo.findActive(50)).length).toBe(1);
  });

  it('findActive filters out isActive=false and respects limit', async () => {
    await repo.save(makeRecord('solana', 'a1'));
    await repo.save(makeRecord('solana', 'a2', { isActive: false }));
    const out = await repo.findActive(50);
    expect(out.map((r) => r.address)).toEqual(['a1']);
  });

  describe('findMany filters', () => {
    beforeEach(async () => {
      await repo.save(
        makeRecord('solana', 'm1', { maxMilestone: 2, priceDropPercent: -50 }),
      );
      await repo.save(
        makeRecord('solana', 'm2', { maxMilestone: 5, priceDropPercent: -10 }),
      );
      await repo.save(
        makeRecord('solana', 'm3', { maxMilestone: 0, priceDropPercent: -99 }),
      );
      await repo.save(
        makeRecord('solana', 'm4', {
          maxMilestone: null,
          priceDropPercent: null,
        }),
      );
    });

    it('hasMilestones=true excludes null maxMilestone', async () => {
      const out = await repo.findMany({ hasMilestones: true });
      expect(out.map((r) => r.address).sort()).toEqual(['m1', 'm2', 'm3']);
    });

    it('minMilestone filters correctly', async () => {
      const out = await repo.findMany({ minMilestone: 2 });
      expect(out.map((r) => r.address).sort()).toEqual(['m1', 'm2']);
    });

    it('maxPriceDropPercent includes calls whose drop ≤ limit (more negative = larger drop)', async () => {
      // maxPriceDropPercent=90 means: include only calls with drop ≤ -90% (dropped 90%+)
      const out = await repo.findMany({ maxPriceDropPercent: 90 });
      // m1=-50, m2=-10 → excluded; m3=-99 → included
      expect(out.map((r) => r.address)).toEqual(['m3']);
    });

    it('limit caps the result', async () => {
      const out = await repo.findMany({ limit: 2 });
      expect(out.length).toBe(2);
    });

    it('default activeOnly=true excludes inactive', async () => {
      await repo.save(makeRecord('solana', 'inactive', { isActive: false }));
      const out = await repo.findMany({});
      expect(out.find((r) => r.address === 'inactive')).toBeUndefined();
    });
  });
});
