import { VerifyVipCallRejectionUseCase } from './verify-vip-call-rejection.use-case';
import { VipCallApprovalDecisionRepository } from 'token/vip-call-approval/application/ports/vip-call-approval-decision.repository';
import { TokenSnapshotRepository } from 'token/enrichment/application/ports/token-snapshot.repository';
import { VipCallApprovalDecision } from 'token/vip-call-approval/domain/entities/vip-call-approval-decision.entity';
import { TokenSnapshot } from 'token/enrichment/domain/entities/token-snapshot.entity';
import { ChainId } from 'chain/identity/chain-id.vo';
import { VipCallApprovalReason } from 'token/vip-call-approval/domain/value-objects/vip-call-approval-reason.vo';
import { ApplyVipCallApprovalUseCase } from './apply-vip-call-approval.use-case';
import { VipCallBlacklistPort } from 'token/vip-call-approval/domain/ports/vip-call-blacklist.port';
import { VipCallApprovalEventPublisher } from 'token/vip-call-approval/application/ports/vip-call-approval-event.publisher';
import type { DomainEvent } from 'shared/kernel/domain-event';

class InMemoryDecisionRepo extends VipCallApprovalDecisionRepository {
  public readonly store = new Map<string, VipCallApprovalDecision>();
  public async save(d: VipCallApprovalDecision): Promise<void> {
    await Promise.resolve();
    this.store.set(d.id, d);
  }
  public async findByChainAndAddress(
    c: ChainId,
    a: string,
  ): Promise<VipCallApprovalDecision | null> {
    await Promise.resolve();
    const lookupKey = c.isSolana ? a : a.toLowerCase();
    return this.store.get(`${c.value}:${lookupKey}`) ?? null;
  }
  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<VipCallApprovalDecision>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(-limit).reverse();
  }
  public async findApproved(
    limit: number,
  ): Promise<ReadonlyArray<VipCallApprovalDecision>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .filter((d) => d.isApproved)
      .slice(0, limit);
  }
  public async findRejected(
    limit: number,
  ): Promise<ReadonlyArray<VipCallApprovalDecision>> {
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
    const lookupKey = c.isSolana ? a : a.toLowerCase();
    return this.store.get(`${c.value}:${lookupKey}`) ?? null;
  }
  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<TokenSnapshot>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(-limit).reverse();
  }
}

class FakeBlacklist extends VipCallBlacklistPort {
  public async isBlacklisted(): Promise<{
    blacklisted: boolean;
    reason: string | null;
  }> {
    await Promise.resolve();
    return { blacklisted: false, reason: null };
  }
}

class FakePublisher extends VipCallApprovalEventPublisher {
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
  const useCase = new ApplyVipCallApprovalUseCase(
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
    classification: 'TOKEN',
    riskWeight: 0,
    snapshotCompleteness: 0,
  });
  void codes;
}

describe('VerifyVipCallRejectionUseCase', () => {
  let decisionRepo: InMemoryDecisionRepo;
  let snapshotRepo: InMemorySnapshotRepo;
  let useCase: VerifyVipCallRejectionUseCase;

  beforeEach(() => {
    decisionRepo = new InMemoryDecisionRepo();
    snapshotRepo = new InMemorySnapshotRepo();
    useCase = new VerifyVipCallRejectionUseCase(decisionRepo, snapshotRepo);
  });

  it('returns diagnostics for a SCORE_TOO_LOW rejection as retryable', async () => {
    await seedRejected(
      decisionRepo,
      'solana',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      ['SCORE_TOO_LOW'],
    );
    const result = await useCase.execute({
      chain: 'solana',
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    });
    expect(result.currentVerdict).toBe('REJECTED');
    expect(result.recommended).toBe('REPROCESS');
    expect(result.retryable).toBe(true);
    const codes = result.retryableReasons.map((r) => r.code);
    expect(codes).toContain('SCORE_TOO_LOW');
    expect(result.blockedReasons).toHaveLength(0);
  });

  it('returns NEEDS_BLACKLIST_REVIEW when BLACKLISTED is the reason', async () => {
    const decision = VipCallApprovalDecision.create({
      chain: ChainId.fromString('solana'),
      address: 'blkAddr',
      score: 50,
      classification: 'TOKEN',
      riskWeight: 0,
      snapshotCompleteness: 1,
      reasons: [
        VipCallApprovalReason.create({
          code: 'BLACKLISTED',
          message: 'is on list',
        }),
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
