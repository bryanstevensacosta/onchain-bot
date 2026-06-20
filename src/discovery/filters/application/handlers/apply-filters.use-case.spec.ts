import { ApplyFiltersUseCase } from 'discovery/filters/application/handlers/apply-filters.use-case';
import { BlacklistPort } from 'discovery/filters/domain/ports/blacklist.port';
import { FilterDecisionRepository } from 'discovery/filters/application/ports/filter-decision.repository';
import { FiltersEventPublisher } from 'discovery/filters/application/ports/filters-event.publisher';
import { FilterDecision } from 'discovery/filters/domain/entities/filter-decision.entity';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import type { DomainEvent } from 'shared/kernel/domain-event';

class FakeBlacklist extends BlacklistPort {
  public constructor(
    private readonly entries: Map<string, string> = new Map(),
  ) {
    super();
  }
  public async isBlacklisted(
    chain: string,
    address: string,
  ): Promise<{ blacklisted: boolean; reason: string | null }> {
    await Promise.resolve();
    const reason =
      this.entries.get(`${chain}:${address.toLowerCase()}`) ?? null;
    return { blacklisted: reason !== null, reason };
  }
}

class InMemoryRepo extends FilterDecisionRepository {
  public readonly store = new Map<string, FilterDecision>();
  public async save(d: FilterDecision): Promise<void> {
    await Promise.resolve();
    this.store.set(d.id, d);
  }
  public async findByChainAndAddress(
    c: ChainId,
    a: string,
  ): Promise<FilterDecision | null> {
    await Promise.resolve();
    return this.store.get(`${c.value}:${a.toLowerCase()}`) ?? null;
  }
  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<FilterDecision>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(-limit).reverse();
  }
  public async findApproved(
    limit: number,
  ): Promise<ReadonlyArray<FilterDecision>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .filter((d) => d.isApproved)
      .slice(0, limit);
  }
  public async findRejected(
    limit: number,
  ): Promise<ReadonlyArray<FilterDecision>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .filter((d) => !d.isApproved)
      .slice(0, limit);
  }
}

class InMemoryPublisher extends FiltersEventPublisher {
  public readonly published: DomainEvent[] = [];
  public async publish(e: DomainEvent): Promise<void> {
    await Promise.resolve();
    this.published.push(e);
  }
}

const EVM = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

describe('ApplyFiltersUseCase', () => {
  let blacklist: FakeBlacklist;
  let repo: InMemoryRepo;
  let publisher: InMemoryPublisher;
  let useCase: ApplyFiltersUseCase;

  beforeEach(() => {
    blacklist = new FakeBlacklist();
    repo = new InMemoryRepo();
    publisher = new InMemoryPublisher();
    useCase = new ApplyFiltersUseCase(blacklist, repo, publisher);
  });

  it('approves a token that passes all gates', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      score: 75,
      classification: 'TOKEN',
      riskWeight: 20,
      snapshotCompleteness: 0.9,
    });

    expect(view.verdict).toBe('APPROVED');
    expect(view.reasons).toEqual([]);
    expect(publisher.published[0].eventName).toBe('filters.token.approved');
  });

  it('rejects on SCORE_TOO_LOW', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      score: 30,
      classification: 'TOKEN',
      riskWeight: 0,
      snapshotCompleteness: 1,
    });

    expect(view.verdict).toBe('REJECTED');
    expect(view.reasons.find((r) => r.code === 'SCORE_TOO_LOW')).toBeDefined();
  });

  it('rejects on CLASSIFICATION_BLOCKED (SCAM)', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      score: 80,
      classification: 'SCAM',
      riskWeight: 0,
      snapshotCompleteness: 1,
    });

    expect(view.verdict).toBe('REJECTED');
    expect(
      view.reasons.find((r) => r.code === 'CLASSIFICATION_BLOCKED'),
    ).toBeDefined();
  });

  it('rejects on CLASSIFICATION_BLOCKED (UNKNOWN)', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      score: 80,
      classification: 'UNKNOWN',
      riskWeight: 0,
      snapshotCompleteness: 1,
    });

    expect(view.verdict).toBe('REJECTED');
  });

  it('rejects on BLACKLISTED', async () => {
    blacklist = new FakeBlacklist(new Map([[`ethereum:${EVM}`, 'Known scam']]));
    useCase = new ApplyFiltersUseCase(blacklist, repo, publisher);

    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      score: 80,
      classification: 'TOKEN',
      riskWeight: 0,
      snapshotCompleteness: 1,
    });

    expect(view.verdict).toBe('REJECTED');
    expect(view.reasons.find((r) => r.code === 'BLACKLISTED')?.message).toBe(
      'Known scam',
    );
  });

  it('rejects on HONEYPOT_SUSPECTED (low score + high risk)', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      score: 5,
      classification: 'TOKEN',
      riskWeight: 80,
      snapshotCompleteness: 1,
    });

    expect(view.verdict).toBe('REJECTED');
    expect(
      view.reasons.find((r) => r.code === 'HONEYPOT_SUSPECTED'),
    ).toBeDefined();
  });

  it('rejects on RISK_WEIGHT_EXCEEDED', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      score: 60,
      classification: 'TOKEN',
      riskWeight: 200,
      snapshotCompleteness: 1,
    });

    expect(view.verdict).toBe('REJECTED');
    expect(
      view.reasons.find((r) => r.code === 'RISK_WEIGHT_EXCEEDED'),
    ).toBeDefined();
  });

  it('rejects on INSUFFICIENT_DATA', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      score: 60,
      classification: 'TOKEN',
      riskWeight: 0,
      snapshotCompleteness: 0.1,
    });

    expect(view.verdict).toBe('REJECTED');
    expect(
      view.reasons.find((r) => r.code === 'INSUFFICIENT_DATA'),
    ).toBeDefined();
  });

  it('rejects on CHAIN_UNSUPPORTED (e.g., bsc is recognized but not publishable yet)', async () => {
    const view = await useCase.execute({
      chain: 'bsc',
      address: EVM,
      score: 80,
      classification: 'TOKEN',
      riskWeight: 0,
      snapshotCompleteness: 1,
    });

    expect(view.verdict).toBe('REJECTED');
    expect(
      view.reasons.find((r) => r.code === 'CHAIN_UNSUPPORTED'),
    ).toBeDefined();
  });

  it('can accumulate multiple rejection reasons', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      score: 30, // too low
      classification: 'SCAM', // blocked
      riskWeight: 200, // exceeded
      snapshotCompleteness: 0.1, // insufficient
    });

    expect(view.verdict).toBe('REJECTED');
    expect(view.reasons.length).toBeGreaterThanOrEqual(4);
  });

  it('respects custom config (lower minScore)', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      score: 30,
      classification: 'TOKEN',
      riskWeight: 0,
      snapshotCompleteness: 1,
      config: {
        minScore: 20,
        maxRiskWeight: 100,
        minCompleteness: 0.3,
        blockedClassifications: ['SCAM'],
        enableBlacklist: true,
      },
    });

    expect(view.verdict).toBe('APPROVED');
    expect(view.reasons).toEqual([]);
  });

  it('respects enableBlacklist=false to skip blacklist check', async () => {
    blacklist = new FakeBlacklist(new Map([[`ethereum:${EVM}`, 'Known scam']]));
    useCase = new ApplyFiltersUseCase(blacklist, repo, publisher);

    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      score: 80,
      classification: 'TOKEN',
      riskWeight: 0,
      snapshotCompleteness: 1,
      config: {
        minScore: 50,
        maxRiskWeight: 100,
        minCompleteness: 0.3,
        blockedClassifications: ['SCAM'],
        enableBlacklist: false,
      },
    });

    expect(view.verdict).toBe('APPROVED');
  });

  it('persists decision and publishes rejection event', async () => {
    await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      score: 30,
      classification: 'TOKEN',
      riskWeight: 0,
      snapshotCompleteness: 1,
    });

    expect(repo.store.size).toBe(1);
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0].eventName).toBe('filters.token.rejected');
  });
});
