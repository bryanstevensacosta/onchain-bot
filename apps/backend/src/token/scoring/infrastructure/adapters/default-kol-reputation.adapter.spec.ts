import { DefaultKolReputationAdapter } from 'token/scoring/infrastructure/adapters/default-kol-reputation.adapter';
import { KolReputationRepository } from 'kol/reputation/application/ports/kol-reputation.repository';
import { KnownKolPort } from 'kol/reputation/application/ports/known-kol.port';
import { KolReputation } from 'kol/reputation/domain/value-objects/kol-reputation.vo';

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
  let adapter: DefaultKolReputationAdapter;

  beforeEach(() => {
    repo = new FakeStatsRepo();
    known = new FakeKnownKol();
    adapter = new DefaultKolReputationAdapter(repo, known);
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
        totalCalls: 2,
        strongCalls: 1,
        goodCalls: 1,
        neutralCalls: 0,
        poorCalls: 0,
        failedCalls: 0,
        avgAthMultiple: 5,
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
      'kol2',
      KolReputation.fromValues({
        kolId: 'kol2',
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
          totalCalls: 20,
          strongCalls: 10,
          goodCalls: 5,
          neutralCalls: 3,
          poorCalls: 1,
          failedCalls: 1,
          avgAthMultiple: 2,
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
