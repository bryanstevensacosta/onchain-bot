import { VerifyRejectedTokenUseCase } from './verify-rejected-token.use-case';
import { FilterDecisionRepository } from 'token/token-gating/application/ports/filter-decision.repository';
import { TokenSnapshotRepository } from 'chain/explorer/application/ports/token-snapshot.repository';
import { FilterDecision } from 'token/token-gating/domain/entities/filter-decision.entity';
import { TokenSnapshot } from 'chain/explorer/domain/entities/token-snapshot.entity';
import { ChainId } from 'chain/identity/chain-id.vo';
import { FilterReason } from 'token/token-gating/domain/value-objects/filter-reason.vo';
import { ApplyFiltersUseCase } from './apply-filters.use-case';
import { BlacklistPort } from 'token/token-gating/domain/ports/blacklist.port';
import { FiltersEventPublisher } from 'token/token-gating/application/ports/filters-event.publisher';
import type { DomainEvent } from 'shared/kernel/domain-event';

class InMemoryDecisionRepo extends FilterDecisionRepository {
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
    const normalized = c.isSolana ? a : a.toLowerCase();
    return this.store.get(`${c.value}:${normalized}`) ?? null;
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
  public async countByVerdict(): Promise<{
    approved: number;
    rejected: number;
  }> {
    await Promise.resolve();
    let approved = 0;
    let rejected = 0;
    for (const d of this.store.values()) {
      if (d.isApproved) approved += 1;
      else rejected += 1;
    }
    return { approved, rejected };
  }
}

class InMemorySnapshotRepo extends TokenSnapshotRepository {
  public readonly store = new Map<string, TokenSnapshot>();
  public async save(s: TokenSnapshot): Promise<void> {
    await Promise.resolve();
    this.store.set(s.id, s);
  }
  public async findByChainAndAddress(
    c: ChainId,
    a: string,
  ): Promise<TokenSnapshot | null> {
    await Promise.resolve();
    const normalized = c.isSolana ? a : a.toLowerCase();
    return this.store.get(`${c.value}:${normalized}`) ?? null;
  }
  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<TokenSnapshot>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(-limit).reverse();
  }
}

class FakeBlacklist extends BlacklistPort {
  public async isBlacklisted(): Promise<{
    blacklisted: boolean;
    reason: string | null;
  }> {
    await Promise.resolve();
    return { blacklisted: false, reason: null };
  }
}

class FakePublisher extends FiltersEventPublisher {
  public async publish(_e: DomainEvent): Promise<void> {
    await Promise.resolve();
  }
}

async function seedRejected(
  repo: InMemoryDecisionRepo,
  chain: string,
  address: string,
  codes: string[],
): Promise<void> {
  const useCase = new ApplyFiltersUseCase(
    new FakeBlacklist(),
    repo,
    new FakePublisher(),
    {
      getTokenGateConfig: async () => ({
        minScore: 50,
        maxRiskWeight: 100,
        minCompleteness: 0.3,
        blockedClassifications: ['SCAM', 'UNKNOWN'],
        enableBlacklist: true,
      }),
      getExtraThresholds: async () => ({
        bundlers: 30,
        insiders: 50,
        bonding: 99,
      }),
      getPublishableChains: async () => ['ethereum', 'solana'],
      getHoneypotHeuristic: async () => ({
        scoreBelow: 10,
        riskWeightAbove: 80,
      }),
    } as never,
  );
  await useCase.execute({
    chain,
    address,
    score: 10,
    classification: 'SCAM',
    riskWeight: 0,
    snapshotCompleteness: 0,
  });
  void codes;
}

describe('VerifyRejectedTokenUseCase', () => {
  let decisionRepo: InMemoryDecisionRepo;
  let snapshotRepo: InMemorySnapshotRepo;
  let useCase: VerifyRejectedTokenUseCase;

  beforeEach(() => {
    decisionRepo = new InMemoryDecisionRepo();
    snapshotRepo = new InMemorySnapshotRepo();
    useCase = new VerifyRejectedTokenUseCase(decisionRepo, snapshotRepo);
  });

  it('returns diagnostics for a SCORE_TOO_LOW rejection as retryable', async () => {
    await seedRejected(decisionRepo, 'solana', 'SoLaNaAdDrEsS', [
      'SCORE_TOO_LOW',
    ]);
    const result = await useCase.execute({
      chain: 'solana',
      address: 'SoLaNaAdDrEsS',
    });
    expect(result.currentVerdict).toBe('REJECTED');
    expect(result.recommended).toBe('REPROCESS');
    expect(result.retryable).toBe(true);
    const codes = result.retryableReasons.map((r) => r.code);
    expect(codes).toContain('SCORE_TOO_LOW');
    expect(result.blockedReasons).toHaveLength(0);
  });

  it('returns NEEDS_BLACKLIST_REVIEW when BLACKLISTED is the reason', async () => {
    const decision = FilterDecision.create({
      chain: ChainId.fromString('solana'),
      address: 'blkAddr',
      score: 50,
      classification: 'TOKEN',
      riskWeight: 0,
      snapshotCompleteness: 1,
      reasons: [
        FilterReason.create({ code: 'BLACKLISTED', message: 'is on list' }),
      ],
    });
    await decisionRepo.save(decision);
    const result = await useCase.execute({
      chain: 'solana',
      address: 'blkAddr',
    });
    expect(result.recommended).toBe('NEEDS_BLACKLIST_REVIEW');
    expect(result.retryable).toBe(false);
    expect(result.blockedReasons.map((r) => r.code)).toContain('BLACKLISTED');
  });

  it('returns SKIP when no decision exists', async () => {
    const result = await useCase.execute({
      chain: 'solana',
      address: 'unknownAddress',
    });
    expect(result.currentVerdict).toBe('NONE');
    expect(result.recommended).toBe('SKIP');
    expect(result.retryable).toBe(false);
  });

  it('attaches snapshotCompleteness and providerErrors when snapshot exists', async () => {
    await seedRejected(decisionRepo, 'solana', 'snApAdDr', [
      'INSUFFICIENT_DATA',
    ]);
    const snapshot = TokenSnapshot.create({
      chain: ChainId.fromString('solana'),
      address: 'snApAdDr',
      pairs: [],
      priceUsd: null,
      liquidityUsd: null,
      volume24hUsd: null,
      marketCapUsd: null,
      fdvUsd: null,
      priceChange24h: null,
      holders: null,
      top10HolderPercent: null,
      name: null,
      imageUrls: [],
      lockedLiquidityPercent: null,
      burnedPercent: null,
      sources: [],
      providerErrors: [
        { provider: 'dexscreener', message: 'timeout' },
        { provider: 'birdeye', message: 'rate limited' },
      ],
      snapshotCompleteness: 0,
    });
    await snapshotRepo.save(snapshot);

    const result = await useCase.execute({
      chain: 'solana',
      address: 'snApAdDr',
    });
    expect(result.snapshotCompleteness).toBe(0);
    expect(result.providerErrors).toHaveLength(2);
    expect(result.providerErrors.map((e) => e.provider).sort()).toEqual([
      'birdeye',
      'dexscreener',
    ]);
  });
});
