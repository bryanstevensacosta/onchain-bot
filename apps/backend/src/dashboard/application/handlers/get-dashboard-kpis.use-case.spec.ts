import { GetDashboardKpisUseCase } from 'dashboard/application/handlers/get-dashboard-kpis.use-case';
import { KolRepository } from 'kol/identity/application/ports/kol.repository';
import { Kol } from 'kol/identity/domain/entities/kol.entity';
import { KolId } from 'kol/identity/domain/value-objects/kol-id.vo';
import { CanonicalTokenCallRepository } from 'token/normalization/application/ports/canonical-token-call.repository';
import { CanonicalTokenCall } from 'token/normalization/domain/entities/canonical-token-call.entity';
import { FilterDecisionRepository } from 'token/token-gating/application/ports/filter-decision.repository';
import { FilterDecision } from 'token/token-gating/domain/entities/filter-decision.entity';
import { PublishedCallRepository, PublishedCall } from 'telegram/shared';

class FakeKolRepo extends KolRepository {
  public rows: Array<{ id: string; active: boolean }> = [];
  public async save(): Promise<void> {}
  public async delete(): Promise<void> {}
  public async updateTitle(): Promise<boolean> {
    return false;
  }
  public async findById(): Promise<Kol | null> {
    return null;
  }
  public async findAll(): Promise<ReadonlyArray<Kol>> {
    return this.rows.map((r) => {
      const kol = Kol.create({
        id: KolId.fromString(r.id),
        handle: null,
        title: `kol-${r.id}`,
      });
      if (r.active) kol.startListening();
      return kol;
    });
  }
}

class FakeCanonicalRepo extends CanonicalTokenCallRepository {
  public size = 0;
  public countCalls = 0;
  public async save(): Promise<void> {}
  public async findByIdentity(): Promise<CanonicalTokenCall | null> {
    return null;
  }
  public async findRecent(): Promise<ReadonlyArray<CanonicalTokenCall>> {
    return [];
  }
  public async count(): Promise<number> {
    this.countCalls += 1;
    return this.size;
  }
}

class FakeFilterRepo extends FilterDecisionRepository {
  public verdicts: Array<'APPROVED' | 'REJECTED'> = [];
  public countByVerdictCalls = 0;
  public async save(): Promise<void> {}
  public async findByChainAndAddress(): Promise<FilterDecision | null> {
    return null;
  }
  public async findRecent(): Promise<ReadonlyArray<FilterDecision>> {
    return [];
  }
  public async findApproved(): Promise<ReadonlyArray<FilterDecision>> {
    return [];
  }
  public async findRejected(): Promise<ReadonlyArray<FilterDecision>> {
    return [];
  }
  public async countByVerdict(): Promise<{
    readonly approved: number;
    readonly rejected: number;
  }> {
    this.countByVerdictCalls += 1;
    let approved = 0;
    let rejected = 0;
    for (const v of this.verdicts) {
      if (v === 'APPROVED') approved += 1;
      else rejected += 1;
    }
    return { approved, rejected };
  }
}

class FakePublishedRepo extends PublishedCallRepository {
  public publishedCount = 0;
  public countPublishedCalls = 0;
  public async save(): Promise<void> {}
  public async findByChainAndAddress(): Promise<PublishedCall | null> {
    return null;
  }
  public async findRecent(): Promise<ReadonlyArray<PublishedCall>> {
    return [];
  }
  public async findPublished(): Promise<ReadonlyArray<PublishedCall>> {
    return [];
  }
  public async findFailed(): Promise<ReadonlyArray<PublishedCall>> {
    return [];
  }
  public async countPublished(): Promise<number> {
    this.countPublishedCalls += 1;
    return this.publishedCount;
  }
}

describe('GetDashboardKpisUseCase', () => {
  it('aggregates counts from the four source BCs', async () => {
    const kols = new FakeKolRepo();
    kols.rows = [
      { id: '1', active: true },
      { id: '2', active: true },
      { id: '3', active: false },
    ];
    const canonical = new FakeCanonicalRepo();
    canonical.size = 42;
    const filters = new FakeFilterRepo();
    filters.verdicts = ['APPROVED', 'APPROVED', 'APPROVED', 'REJECTED'];
    const published = new FakePublishedRepo();
    published.publishedCount = 7;

    const useCase = new GetDashboardKpisUseCase(
      kols,
      canonical,
      filters,
      published,
    );

    const kpis = await useCase.execute();
    expect(kpis).toEqual({
      activeKols: 2,
      totalKols: 3,
      totalCanonicalCalls: 42,
      approvedDecisions: 3,
      rejectedDecisions: 1,
      publishedCalls: 7,
    });
  });

  it('hits count endpoints exactly once per call (parallel)', async () => {
    const kols = new FakeKolRepo();
    kols.rows = [];
    const canonical = new FakeCanonicalRepo();
    const filters = new FakeFilterRepo();
    const published = new FakePublishedRepo();
    const useCase = new GetDashboardKpisUseCase(
      kols,
      canonical,
      filters,
      published,
    );
    await useCase.execute();
    await useCase.execute();
    expect(canonical.countCalls).toBe(2);
    expect(filters.countByVerdictCalls).toBe(2);
    expect(published.countPublishedCalls).toBe(2);
  });
});
