import { CanRepublishTokenUseCase } from './can-republish-token.use-case';
import {
  TrackedPublishedCallRepository,
  TrackedPublishedCallRecord,
} from '../ports/tracked-published-call.repository';
import { SettingsService } from 'settings/application/services/settings.service';

class StubTrackedRepo extends TrackedPublishedCallRepository {
  record: TrackedPublishedCallRecord | null = null;
  async findByChainAndAddress() {
    return this.record;
  }
  async findActive() {
    return [];
  }
  async findMany() {
    return [];
  }
  async save() {
    throw new Error('not used');
  }
}

class StubSettings {
  rows: Array<{ value: string; numericValue: number | null }> = [];
  async getFiltersByType() {
    return this.rows;
  }
}

function makeSettings(
  rows: Array<{ value: string; numericValue: number | null }>,
) {
  const s = new StubSettings();
  s.rows = rows;
  return s as unknown as SettingsService;
}

const ENABLED = { value: 'tracking_enabled', numericValue: 1 };
const DISABLED = { value: 'tracking_enabled', numericValue: 0 };

describe('CanRepublishTokenUseCase', () => {
  const chain = 'solana';
  const address = 'So11111111111111111111111111111111111111112';

  it('denies when no tracked call exists', async () => {
    const repo = new StubTrackedRepo();
    const uc = new CanRepublishTokenUseCase(repo, makeSettings([ENABLED]));
    const res = await uc.execute({ chain, address });
    expect(res.allowed).toBe(false);
    expect(res.reasons).toContain('no_tracked_call');
  });

  it('denies when tracking_enabled is false', async () => {
    const repo = new StubTrackedRepo();
    const oneHourAgo = new Date(Date.now() - 1000 * 3600);
    repo.record = {
      id: `${chain}:${address.toLowerCase()}`,
      kolId: 'kol_x',
      chain,
      address: address.toLowerCase(),
      ticker: 'WIF',
      mcAtPublish: 1000,
      mcNow: 3000,
      milestonesHit: [2, 3],
      maxMilestone: 3,
      priceDropPercent: 200,
      publishedAt: oneHourAgo,
      lastUpdatedAt: oneHourAgo,
      isActive: true,
    };
    const uc = new CanRepublishTokenUseCase(repo, makeSettings([DISABLED]));
    const res = await uc.execute({ chain, address });
    expect(res.allowed).toBe(false);
    expect(res.reasons).toContain('tracking_disabled');
  });

  it('allows when all gates pass (milestone recent, multiple ≥ min, drop ≤ max)', async () => {
    const repo = new StubTrackedRepo();
    const recent = new Date(Date.now() - 1000 * 3600);
    repo.record = {
      id: `${chain}:${address.toLowerCase()}`,
      kolId: 'kol_x',
      chain,
      address: address.toLowerCase(),
      ticker: 'WIF',
      mcAtPublish: 1000,
      mcNow: 3000,
      milestonesHit: [2, 3],
      maxMilestone: 3,
      priceDropPercent: -20,
      publishedAt: recent,
      lastUpdatedAt: recent,
      isActive: true,
    };
    const uc = new CanRepublishTokenUseCase(
      repo,
      makeSettings([
        ENABLED,
        { value: 'milestone_min_hours_ago', numericValue: 72 },
        { value: 'milestone_min_multiple', numericValue: 2 },
        { value: 'price_drop_max_percent', numericValue: 90 },
      ]),
    );
    const res = await uc.execute({ chain, address });
    expect(res.allowed).toBe(true);
    expect(res.reasons).toEqual([]);
  });

  it('denies when maxMilestone is null (no milestones hit)', async () => {
    const repo = new StubTrackedRepo();
    const recent = new Date();
    repo.record = {
      id: `${chain}:${address.toLowerCase()}`,
      kolId: 'kol_x',
      chain,
      address: address.toLowerCase(),
      ticker: null,
      mcAtPublish: 1000,
      mcNow: 1100,
      milestonesHit: [],
      maxMilestone: null,
      priceDropPercent: 10,
      publishedAt: recent,
      lastUpdatedAt: recent,
      isActive: true,
    };
    const uc = new CanRepublishTokenUseCase(
      repo,
      makeSettings([
        ENABLED,
        { value: 'milestone_min_hours_ago', numericValue: 72 },
        { value: 'milestone_min_multiple', numericValue: 2 },
        { value: 'price_drop_max_percent', numericValue: 90 },
      ]),
    );
    const res = await uc.execute({ chain, address });
    expect(res.allowed).toBe(false);
    expect(res.reasons).toContain('milestone_below_min');
  });

  it('denies when maxMilestone < milestone_min_multiple', async () => {
    const repo = new StubTrackedRepo();
    const recent = new Date();
    repo.record = {
      id: `${chain}:${address.toLowerCase()}`,
      kolId: 'kol_x',
      chain,
      address: address.toLowerCase(),
      ticker: null,
      mcAtPublish: 1000,
      mcNow: 1500,
      milestonesHit: [2],
      maxMilestone: 2,
      priceDropPercent: 50,
      publishedAt: recent,
      lastUpdatedAt: recent,
      isActive: true,
    };
    const uc = new CanRepublishTokenUseCase(
      repo,
      makeSettings([
        ENABLED,
        { value: 'milestone_min_hours_ago', numericValue: 72 },
        { value: 'milestone_min_multiple', numericValue: 5 },
        { value: 'price_drop_max_percent', numericValue: 90 },
      ]),
    );
    const res = await uc.execute({ chain, address });
    expect(res.allowed).toBe(false);
    expect(res.reasons).toContain('milestone_below_min');
  });

  it('denies when milestone is too old (lastUpdatedAt > N hours ago)', async () => {
    const repo = new StubTrackedRepo();
    const tooOld = new Date(Date.now() - 1000 * 3600 * 100);
    repo.record = {
      id: `${chain}:${address.toLowerCase()}`,
      kolId: 'kol_x',
      chain,
      address: address.toLowerCase(),
      ticker: null,
      mcAtPublish: 1000,
      mcNow: 3000,
      milestonesHit: [2, 3],
      maxMilestone: 3,
      priceDropPercent: 200,
      publishedAt: tooOld,
      lastUpdatedAt: tooOld,
      isActive: true,
    };
    const uc = new CanRepublishTokenUseCase(
      repo,
      makeSettings([
        ENABLED,
        { value: 'milestone_min_hours_ago', numericValue: 72 },
        { value: 'milestone_min_multiple', numericValue: 2 },
        { value: 'price_drop_max_percent', numericValue: 90 },
      ]),
    );
    const res = await uc.execute({ chain, address });
    expect(res.allowed).toBe(false);
    expect(res.reasons).toContain('milestone_too_old');
  });

  it('denies when price drop exceeds max (drop -95% > limit 90%)', async () => {
    const repo = new StubTrackedRepo();
    const recent = new Date();
    repo.record = {
      id: `${chain}:${address.toLowerCase()}`,
      kolId: 'kol_x',
      chain,
      address: address.toLowerCase(),
      ticker: null,
      mcAtPublish: 1000,
      mcNow: 50,
      milestonesHit: [2, 3],
      maxMilestone: 3,
      priceDropPercent: -95,
      publishedAt: recent,
      lastUpdatedAt: recent,
      isActive: true,
    };
    const uc = new CanRepublishTokenUseCase(
      repo,
      makeSettings([
        ENABLED,
        { value: 'milestone_min_hours_ago', numericValue: 72 },
        { value: 'milestone_min_multiple', numericValue: 2 },
        { value: 'price_drop_max_percent', numericValue: 90 },
      ]),
    );
    const res = await uc.execute({ chain, address });
    expect(res.allowed).toBe(false);
    expect(res.reasons).toContain('price_drop_exceeds_limit');
  });

  it('uses default values when settings rows are missing', async () => {
    const repo = new StubTrackedRepo();
    const recent = new Date();
    repo.record = {
      id: `${chain}:${address.toLowerCase()}`,
      kolId: 'kol_x',
      chain,
      address: address.toLowerCase(),
      ticker: null,
      mcAtPublish: 1000,
      mcNow: 5000,
      milestonesHit: [2, 5],
      maxMilestone: 5,
      priceDropPercent: 400,
      publishedAt: recent,
      lastUpdatedAt: recent,
      isActive: true,
    };
    const uc = new CanRepublishTokenUseCase(repo, makeSettings([]));
    const res = await uc.execute({ chain, address });
    expect(res.allowed).toBe(true);
  });

  it('ignores inactive tracked calls', async () => {
    const repo = new StubTrackedRepo();
    const recent = new Date();
    repo.record = {
      id: `${chain}:${address.toLowerCase()}`,
      kolId: 'kol_x',
      chain,
      address: address.toLowerCase(),
      ticker: null,
      mcAtPublish: 1000,
      mcNow: 5000,
      milestonesHit: [2, 5],
      maxMilestone: 5,
      priceDropPercent: 400,
      publishedAt: recent,
      lastUpdatedAt: recent,
      isActive: false,
    };
    const uc = new CanRepublishTokenUseCase(repo, makeSettings([ENABLED]));
    const res = await uc.execute({ chain, address });
    expect(res.allowed).toBe(false);
    expect(res.reasons).toContain('no_tracked_call');
  });
});
