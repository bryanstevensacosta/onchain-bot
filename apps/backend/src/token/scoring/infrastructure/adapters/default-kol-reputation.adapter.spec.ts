import { DefaultKolReputationAdapter } from 'token/scoring/infrastructure/adapters/default-kol-reputation.adapter';
import { KolReputationRepository } from 'kol/reputation/application/ports/kol-reputation.repository';
import { KnownKolPort } from 'kol/reputation/application/ports/known-kol.port';
import { KolReputation } from 'kol/reputation/domain/value-objects/kol-reputation.vo';
import { SettingsService } from 'settings/application/services/settings.service';

class FakeSettings extends SettingsService {
  public constructor() {
    super({} as never);
  }
  public async getKolReputationThresholds(): Promise<{
    unknown: number;
    trusted: number;
    suspicious: number;
  }> {
    return { unknown: 0.5, trusted: 0.7, suspicious: 0.3 };
  }
}

class FakeStatsRepo extends KolReputationRepository {
  public stats = new Map<string, KolReputation>();
  public findByIdsCalls = 0;
  public async save(s: KolReputation): Promise<void> {
    await Promise.resolve();
    this.stats.set(s.kolId, s);
  }
  public async findByKol(kolId: string): Promise<KolReputation | null> {
    return this.stats.get(kolId) ?? null;
  }
  public async findByIds(
    ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<KolReputation>> {
    this.findByIdsCalls += 1;
    const wanted = new Set(ids);
    return Array.from(this.stats.values()).filter((s) => wanted.has(s.kolId));
  }
  public async findAll(): Promise<ReadonlyArray<KolReputation>> {
    return Array.from(this.stats.values());
  }
  public async findTop(limit: number): Promise<ReadonlyArray<KolReputation>> {
    return Array.from(this.stats.values()).slice(0, limit);
  }
}

class FakeKnownKol extends KnownKolPort {
  private readonly good = new Map<string, number>([
    ['spydefi', 0.95],
    ['whaleinsiders', 0.9],
  ]);
  private readonly bad = new Set<string>(['free_airdrop_spam']);
  public getGoodScore(kolId: string): number | null {
    return this.good.get(kolId.toLowerCase()) ?? null;
  }
  public isBad(kolId: string): boolean {
    return this.bad.has(kolId.toLowerCase());
  }
}

describe('DefaultKolReputationAdapter', () => {
  let repo: FakeStatsRepo;
  let known: FakeKnownKol;
  let settings: FakeSettings;
  let adapter: DefaultKolReputationAdapter;

  beforeEach(() => {
    repo = new FakeStatsRepo();
    known = new FakeKnownKol();
    settings = new FakeSettings();
    adapter = new DefaultKolReputationAdapter(repo, known, settings);
  });

  it('returns high reputation for SpyDefi (known good)', async () => {
    const rep = await adapter.getReputation('SpyDefi');
    expect(rep.score).toBe(0.95);
    expect(rep.isTrusted()).toBe(true);
  });

  it('returns low reputation for known bad KOLs', async () => {
    const rep = await adapter.getReputation('free_airdrop_spam');
    expect(rep.score).toBe(0.1);
    expect(rep.isSuspicious()).toBe(true);
  });

  it('returns default 0.5 for unknown KOLs with no history', async () => {
    const rep = await adapter.getReputation('random-kol');
    expect(rep.score).toBe(0.5);
  });

  it('uses real historical stats when available (HIGH confidence)', async () => {
    repo.stats.set(
      'mysterykol',
      KolReputation.fromValues({
        kolId: 'mysterykol',
        score: 0.88,
        metrics: {
          totalMentions: 30,
          x2Count: 12,
          x5Count: 5,
          x10Count: 0,
          x50Count: 0,
          rug50Count: 1,
          rug80Count: 0,
          neutralCount: 12,
          mentionScore: 0.7,
          qualityScore: 0.65,
          drawdownScore: 0.95,
        },
        confidence: 'HIGH',
      }),
    );
    const rep = await adapter.getReputation('mysterykol');
    expect(rep.score).toBe(0.88);
    expect(rep.isTrusted()).toBe(true);
  });

  it('ignores LOW confidence stats (still neutral)', async () => {
    repo.stats.set(
      'newkol',
      KolReputation.fromValues({
        kolId: 'newkol',
        score: 0.9,
        metrics: {
          totalMentions: 2,
          x2Count: 1,
          x5Count: 0,
          x10Count: 0,
          x50Count: 0,
          rug50Count: 0,
          rug80Count: 0,
          neutralCount: 1,
          mentionScore: 0.55,
          qualityScore: 0.5,
          drawdownScore: 1,
        },
        confidence: 'LOW',
      }),
    );
    const rep = await adapter.getReputation('newkol');
    expect(rep.score).toBe(0.5);
  });

  it('KNOWN_BAD overrides any historical stats', async () => {
    repo.stats.set(
      'free_airdrop_spam',
      KolReputation.fromValues({
        kolId: 'free_airdrop_spam',
        score: 0.99,
        metrics: {
          totalMentions: 100,
          x2Count: 80,
          x5Count: 5,
          x10Count: 0,
          x50Count: 0,
          rug50Count: 3,
          rug80Count: 2,
          neutralCount: 10,
          mentionScore: 0.9,
          qualityScore: 0.85,
          drawdownScore: 0.7,
        },
        confidence: 'VERY_HIGH',
      }),
    );
    const rep = await adapter.getReputation('free_airdrop_spam');
    expect(rep.score).toBe(0.1);
  });

  it('is case-insensitive on KNOWN_GOOD / KNOWN_BAD lookups', async () => {
    const rep = await adapter.getReputation('SPYDEFI');
    expect(rep.score).toBe(0.95);
  });

  it('getAverageReputation averages multiple KOLs', async () => {
    repo.stats.set(
      'kol1',
      KolReputation.fromValues({
        kolId: 'kol1',
        score: 0.9,
        metrics: {
          totalMentions: 50,
          x2Count: 30,
          x5Count: 5,
          x10Count: 0,
          x50Count: 0,
          rug50Count: 3,
          rug80Count: 2,
          neutralCount: 10,
          mentionScore: 0.85,
          qualityScore: 0.7,
          drawdownScore: 0.7,
        },
        confidence: 'VERY_HIGH',
      }),
    );
    repo.stats.set(
      'kol2',
      KolReputation.fromValues({
        kolId: 'kol2',
        score: 0.6,
        metrics: {
          totalMentions: 20,
          x2Count: 5,
          x5Count: 3,
          x10Count: 0,
          x50Count: 0,
          rug50Count: 1,
          rug80Count: 0,
          neutralCount: 11,
          mentionScore: 0.65,
          qualityScore: 0.4,
          drawdownScore: 0.95,
        },
        confidence: 'HIGH',
      }),
    );
    const avg = await adapter.getAverageReputation(['kol1', 'kol2']);
    expect(avg).toBeCloseTo((0.9 + 0.6) / 2, 2);
  });

  it('getAverageReputation returns 0.5 for empty list', async () => {
    expect(await adapter.getAverageReputation([])).toBe(0.5);
  });

  it('getAverageReputation batches DB lookups via findByIds (no N findByKol)', async () => {
    const ids = ['batch-a', 'batch-b', 'batch-c'];
    for (const id of ids) {
      repo.stats.set(
        id,
        KolReputation.fromValues({
          kolId: id,
          score: 0.8,
          metrics: {
            totalMentions: 20,
            x2Count: 10,
            x5Count: 5,
            x10Count: 0,
            x50Count: 0,
            rug50Count: 1,
            rug80Count: 0,
            neutralCount: 4,
            mentionScore: 0.65,
            qualityScore: 0.65,
            drawdownScore: 0.95,
          },
          confidence: 'HIGH',
        }),
      );
    }
    const callsBefore = repo.findByIdsCalls;
    const avg = await adapter.getAverageReputation(ids);
    expect(avg).toBeCloseTo(0.8, 2);
    expect(repo.findByIdsCalls - callsBefore).toBe(1);
  });

  it('getAverageReputation skips DB for KNOWN_GOOD / KNOWN_BAD KOLs', async () => {
    const callsBefore = repo.findByIdsCalls;
    // SpyDefi + free_airdrop_spam are KNOWN_GOOD / KNOWN_BAD; the third
    // kol is unknown and will trigger a single batched findByIds with
    // only that kol in the unresolved bucket.
    const avg = await adapter.getAverageReputation([
      'SpyDefi',
      'free_airdrop_spam',
      'no-stats-kol',
    ]);
    expect(avg).toBeCloseTo((0.95 + 0.1 + 0.5) / 3, 2);
    expect(repo.findByIdsCalls - callsBefore).toBe(1);
  });
});
