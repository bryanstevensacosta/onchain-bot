import { DefaultChannelReputationAdapter } from 'discovery/scoring/infrastructure/adapters/default-channel-reputation.adapter';
import { ChannelReputationStatsRepository } from 'discovery/analytics/application/ports/channel-reputation-stats.repository';
import { ChannelReputationStats } from 'discovery/analytics/domain/value-objects/channel-reputation-stats.vo';

class FakeStatsRepo extends ChannelReputationStatsRepository {
  public stats = new Map<string, ChannelReputationStats>();
  public async save(s: ChannelReputationStats): Promise<void> {
    await Promise.resolve();
    this.stats.set(s.channelId, s);
  }
  public async findByChannel(
    channelId: string,
  ): Promise<ChannelReputationStats | null> {
    await Promise.resolve();
    return this.stats.get(channelId) ?? null;
  }
  public async findAll(): Promise<ReadonlyArray<ChannelReputationStats>> {
    await Promise.resolve();
    return Array.from(this.stats.values());
  }
  public async findTop(
    limit: number,
  ): Promise<ReadonlyArray<ChannelReputationStats>> {
    await Promise.resolve();
    return Array.from(this.stats.values()).slice(0, limit);
  }
}

describe('DefaultChannelReputationAdapter', () => {
  let repo: FakeStatsRepo;
  let adapter: DefaultChannelReputationAdapter;

  beforeEach(() => {
    repo = new FakeStatsRepo();
    adapter = new DefaultChannelReputationAdapter(repo);
  });

  it('returns high reputation for SpyDefi (known good)', async () => {
    const rep = await adapter.getReputation('SpyDefi');
    expect(rep.score).toBe(0.95);
    expect(rep.isTrusted()).toBe(true);
  });

  it('returns low reputation for known bad channels', async () => {
    const rep = await adapter.getReputation('free_airdrop_spam');
    expect(rep.score).toBe(0.1);
    expect(rep.isSuspicious()).toBe(true);
  });

  it('returns default 0.5 for unknown channels with no history', async () => {
    const rep = await adapter.getReputation('random-channel');
    expect(rep.score).toBe(0.5);
  });

  it('uses real historical stats from Analytics when available (MEDIUM confidence)', async () => {
    repo.stats.set(
      'mysterychannel',
      ChannelReputationStats.fromValues({
        channelId: 'mysterychannel',
        score: 0.88,
        totalCalls: 30,
        strongCalls: 12,
        goodCalls: 10,
        neutralCalls: 5,
        poorCalls: 2,
        failedCalls: 1,
        avgAthMultiple: 3.2,
        confidence: 'HIGH',
      }),
    );
    const rep = await adapter.getReputation('mysterychannel');
    expect(rep.score).toBe(0.88);
    expect(rep.isTrusted()).toBe(true);
  });

  it('ignores LOW confidence stats (still neutral)', async () => {
    repo.stats.set(
      'newchannel',
      ChannelReputationStats.fromValues({
        channelId: 'newchannel',
        score: 0.9,
        totalCalls: 2, // too few — LOW confidence
        strongCalls: 1,
        goodCalls: 1,
        neutralCalls: 0,
        poorCalls: 0,
        failedCalls: 0,
        avgAthMultiple: 5,
        confidence: 'LOW',
      }),
    );
    const rep = await adapter.getReputation('newchannel');
    expect(rep.score).toBe(0.5); // neutral because LOW confidence
  });

  it('KNOWN_BAD overrides any historical stats', async () => {
    repo.stats.set(
      'free_airdrop_spam',
      ChannelReputationStats.fromValues({
        channelId: 'free_airdrop_spam',
        score: 0.99, // would normally be trusted
        totalCalls: 100,
        strongCalls: 80,
        goodCalls: 10,
        neutralCalls: 5,
        poorCalls: 3,
        failedCalls: 2,
        avgAthMultiple: 4,
        confidence: 'VERY_HIGH',
      }),
    );
    const rep = await adapter.getReputation('free_airdrop_spam');
    expect(rep.score).toBe(0.1); // hardcoded KNOWN_BAD wins
  });

  it('is case-insensitive', async () => {
    const rep = await adapter.getReputation('SPYDEFI');
    expect(rep.score).toBe(0.95);
  });

  it('getAverageReputation averages multiple channels', async () => {
    repo.stats.set(
      'chan1',
      ChannelReputationStats.fromValues({
        channelId: 'chan1',
        score: 0.9,
        totalCalls: 50,
        strongCalls: 30,
        goodCalls: 10,
        neutralCalls: 5,
        poorCalls: 3,
        failedCalls: 2,
        avgAthMultiple: 3,
        confidence: 'VERY_HIGH',
      }),
    );
    repo.stats.set(
      'chan2',
      ChannelReputationStats.fromValues({
        channelId: 'chan2',
        score: 0.6,
        totalCalls: 20,
        strongCalls: 5,
        goodCalls: 8,
        neutralCalls: 5,
        poorCalls: 1,
        failedCalls: 1,
        avgAthMultiple: 1.5,
        confidence: 'HIGH',
      }),
    );
    const avg = await adapter.getAverageReputation(['chan1', 'chan2']);
    expect(avg).toBeCloseTo((0.9 + 0.6) / 2, 2);
  });

  it('getAverageReputation returns 0.5 for empty list', async () => {
    expect(await adapter.getAverageReputation([])).toBe(0.5);
  });
});
