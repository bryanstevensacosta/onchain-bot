import { TrackPublishedCallUseCase } from './track-published-call.use-case';
import {
  TrackedPublishedCallRepository,
  TrackedPublishedCallRecord,
} from '../ports/tracked-published-call.repository';
import { PublishedCallRepository } from 'telegram/shared/application/ports/published-call.repository';
import { ChainId } from 'chain/identity/chain-id.vo';
import { PublishedCall } from 'telegram/shared/domain/entities/published-call.entity';

class StubTrackedRepo extends TrackedPublishedCallRepository {
  records = new Map<string, TrackedPublishedCallRecord>();
  async findByChainAndAddress(chain: string, address: string) {
    return this.records.get(`${chain}:${address.toLowerCase()}`) ?? null;
  }
  async findActive(limit: number) {
    return Array.from(this.records.values())
      .filter((r) => r.isActive)
      .slice(0, limit);
  }
  async findMany() {
    return [];
  }
  async save(record: TrackedPublishedCallRecord) {
    this.records.set(`${record.chain}:${record.address.toLowerCase()}`, {
      ...record,
    });
    return record;
  }
}

class StubPublishedRepo extends PublishedCallRepository {
  stored: PublishedCall | null = null;
  async save(call: PublishedCall) {
    this.stored = call;
  }
  async findByChainAndAddress() {
    return this.stored;
  }
  async findRecent() {
    return [];
  }
  async findPublished() {
    return [];
  }
  async findFailed() {
    return [];
  }
  async countPublished() {
    return 0;
  }
}

function makePublishedCall(opts: {
  mcAtCall: number | null;
  channelId?: string;
}) {
  const chain = ChainId.fromString('solana');
  const call = Object.create(PublishedCall.prototype);
  Object.defineProperty(call, 'mcAtCall', { get: () => opts.mcAtCall });
  Object.defineProperty(call, 'publishedChannelIds', {
    get: () => (opts.channelId ? [opts.channelId] : []),
  });
  return call as unknown as PublishedCall;
}

describe('TrackPublishedCallUseCase', () => {
  it('creates a tracked call on first publish with mcAtPublish from published-call repo', async () => {
    const trackedRepo = new StubTrackedRepo();
    const publishedRepo = new StubPublishedRepo();
    publishedRepo.stored = makePublishedCall({
      mcAtCall: 50_000,
      channelId: 'kol_spydefi',
    });
    const uc = new TrackPublishedCallUseCase(trackedRepo, publishedRepo);

    const result = await uc.execute({
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111112',
      ticker: 'WIF',
      publishedAt: new Date('2026-06-24T10:00:00Z'),
    });

    expect(result.created).toBe(true);
    const stored = await trackedRepo.findByChainAndAddress(
      'solana',
      'So11111111111111111111111111111111111111112',
    );
    expect(stored?.mcAtPublish).toBe(50_000);
    expect(stored?.kolId).toBe('kol_spydefi');
    expect(stored?.ticker).toBe('WIF');
  });

  it('is idempotent — re-publishing updates the existing row (not insert)', async () => {
    const trackedRepo = new StubTrackedRepo();
    const publishedRepo = new StubPublishedRepo();
    publishedRepo.stored = makePublishedCall({
      mcAtCall: 80_000,
      channelId: 'kol_x',
    });
    const uc = new TrackPublishedCallUseCase(trackedRepo, publishedRepo);

    const input = {
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111112',
      ticker: 'WIF',
      publishedAt: new Date('2026-06-24T10:00:00Z'),
    };
    const first = await uc.execute(input);
    const second = await uc.execute(input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    const active = await trackedRepo.findActive(50);
    expect(active).toHaveLength(1);
  });

  it('preserves existing milestonesHit / mcNow when re-publishing', async () => {
    const trackedRepo = new StubTrackedRepo();
    const publishedRepo = new StubPublishedRepo();
    publishedRepo.stored = makePublishedCall({
      mcAtCall: 100_000,
      channelId: 'kol_x',
    });
    const uc = new TrackPublishedCallUseCase(trackedRepo, publishedRepo);
    const key = 'solana:so11111111111111111111111111111111111111112';

    await uc.execute({
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111112',
      ticker: 'WIF',
      publishedAt: new Date('2026-06-24T10:00:00Z'),
    });
    // simulate cron update
    const first = await trackedRepo.findByChainAndAddress(
      'solana',
      'So11111111111111111111111111111111111111112',
    );
    await trackedRepo.save({
      ...(first as TrackedPublishedCallRecord),
      mcNow: 200_000,
      milestonesHit: [2, 3],
      maxMilestone: 3,
      priceDropPercent: 100,
      lastUpdatedAt: new Date('2026-06-24T11:00:00Z'),
    });
    // re-publish
    await uc.execute({
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111112',
      ticker: 'WIF',
      publishedAt: new Date('2026-06-24T12:00:00Z'),
    });
    const rehydrated = trackedRepo.records.get(key);
    expect(rehydrated?.mcNow).toBe(200_000);
    expect(rehydrated?.milestonesHit).toEqual([2, 3]);
    expect(rehydrated?.maxMilestone).toBe(3);
  });

  it('falls back to mcAtPublish=0 when published call repo returns null', async () => {
    const trackedRepo = new StubTrackedRepo();
    const publishedRepo = new StubPublishedRepo();
    publishedRepo.stored = null;
    const uc = new TrackPublishedCallUseCase(trackedRepo, publishedRepo);

    await uc.execute({
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111112',
      ticker: null,
      publishedAt: new Date(),
    });
    const stored = await trackedRepo.findByChainAndAddress(
      'solana',
      'So11111111111111111111111111111111111111112',
    );
    expect(stored?.mcAtPublish).toBe(0);
    expect(stored?.kolId).toBe('unknown');
  });

  it('uses input.kolId when explicitly provided', async () => {
    const trackedRepo = new StubTrackedRepo();
    const publishedRepo = new StubPublishedRepo();
    publishedRepo.stored = makePublishedCall({
      mcAtCall: 10_000,
      channelId: 'kol_from_repo',
    });
    const uc = new TrackPublishedCallUseCase(trackedRepo, publishedRepo);

    await uc.execute({
      chain: 'solana',
      address: 'So11111111111111111111111111111111111111112',
      ticker: 'WIF',
      publishedAt: new Date(),
      kolId: 'kol_override',
    });
    const stored = await trackedRepo.findByChainAndAddress(
      'solana',
      'So11111111111111111111111111111111111111112',
    );
    expect(stored?.kolId).toBe('kol_override');
  });
});
