import { ScoreTokenUseCase } from 'discovery/scoring/application/handlers/score-token.use-case';
import { TokenScoreRepository } from 'discovery/scoring/application/ports/token-score.repository';
import { ScoringEventPublisher } from 'discovery/scoring/application/ports/scoring-event.publisher';
import { ChannelReputationPort } from 'discovery/scoring/domain/ports/channel-reputation.port';
import { ChannelReputation } from 'discovery/scoring/domain/value-objects/channel-reputation.vo';
import { TokenScore } from 'discovery/scoring/domain/entities/token-score.entity';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import type { DomainEvent } from 'shared/kernel/domain-event';

class FakeReputation extends ChannelReputationPort {
  public constructor(private readonly defaults: Record<string, number> = {}) {
    super();
  }
  public async getReputation(channelId: string): Promise<ChannelReputation> {
    const score = this.defaults[channelId] ?? 0.5;
    return await Promise.resolve(
      ChannelReputation.create({ channelId, score }),
    );
  }
  public async getAverageReputation(
    ids: ReadonlyArray<string>,
  ): Promise<number> {
    if (ids.length === 0) return 0.5;
    const reps = await Promise.all(ids.map((id) => this.getReputation(id)));
    return reps.reduce((sum, r) => sum + r.score, 0) / reps.length;
  }
}

class InMemoryRepo extends TokenScoreRepository {
  public readonly store = new Map<string, TokenScore>();
  public async save(s: TokenScore): Promise<void> {
    await Promise.resolve();
    this.store.set(s.id, s);
  }
  public async findByChainAndAddress(
    c: ChainId,
    a: string,
  ): Promise<TokenScore | null> {
    await Promise.resolve();
    return this.store.get(`${c.value}:${a.toLowerCase()}`) ?? null;
  }
  public async findRecent(limit: number): Promise<ReadonlyArray<TokenScore>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(-limit).reverse();
  }
  public async findTopScores(
    limit: number,
    min: number,
  ): Promise<ReadonlyArray<TokenScore>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .filter((s) => s.score.value >= min)
      .slice(0, limit);
  }
}

class InMemoryPublisher extends ScoringEventPublisher {
  public readonly published: DomainEvent[] = [];
  public async publish(e: DomainEvent): Promise<void> {
    await Promise.resolve();
    this.published.push(e);
  }
}

const EVM = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

describe('ScoreTokenUseCase', () => {
  let repo: InMemoryRepo;
  let publisher: InMemoryPublisher;

  beforeEach(() => {
    repo = new InMemoryRepo();
    publisher = new InMemoryPublisher();
  });

  it('scores a healthy multi-channel buzz as STRONG (>=80)', async () => {
    const rep = new FakeReputation({ SpyDefi: 0.95, whaleinsiders: 0.9 });
    const useCase = new ScoreTokenUseCase(rep, repo, publisher);

    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      classification: 'TOKEN',
      signals: [],
      liquidityUsd: 60_000,
      marketCapUsd: 1_500_000,
      volume24hUsd: 80_000,
      holders: 1500,
      sourceCount: 3,
      mentionCount: 6,
      sourceChannelIds: ['SpyDefi', 'whaleinsiders'],
    });

    expect(view.score).toBeGreaterThanOrEqual(80);
    expect(view.tier).toBe('STRONG');
    expect(view.classification).toBe('TOKEN');
    expect(view.avgChannelReputation).toBeCloseTo(0.925, 2);
    expect(
      view.breakdown.find((b) => b.factor === 'LIQUIDITY_HIGH'),
    ).toBeDefined();
    expect(
      view.breakdown.find((b) => b.factor === 'MULTI_CHANNEL_BUZZ'),
    ).toBeDefined();
  });

  it('caps SCAM classification at 5 even if metrics are perfect', async () => {
    const rep = new FakeReputation();
    const useCase = new ScoreTokenUseCase(rep, repo, publisher);

    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      classification: 'SCAM',
      signals: [],
      liquidityUsd: 1_000_000,
      marketCapUsd: 10_000_000,
      volume24hUsd: 1_000_000,
      holders: 5000,
      sourceCount: 5,
      mentionCount: 50,
      sourceChannelIds: ['SpyDefi'],
    });

    expect(view.score).toBe(5);
    expect(view.tier).toBe('AVOID');
    expect(
      view.breakdown.find((b) => b.factor === 'CLASSIFICATION_CAP'),
    ).toBeDefined();
  });

  it('caps UNKNOWN classification at 20', async () => {
    const rep = new FakeReputation();
    const useCase = new ScoreTokenUseCase(rep, repo, publisher);

    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      classification: 'UNKNOWN',
      signals: [],
      liquidityUsd: null,
      marketCapUsd: null,
      volume24hUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      sourceChannelIds: [],
    });

    expect(view.score).toBe(20);
    expect(
      view.breakdown.find((b) => b.factor === 'CLASSIFICATION_CAP'),
    ).toBeDefined();
  });

  it('penalizes CRITICAL POSSIBLE_RUG signal heavily', async () => {
    const rep = new FakeReputation();
    const useCase = new ScoreTokenUseCase(rep, repo, publisher);

    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      classification: 'TOKEN',
      signals: [
        {
          type: 'POSSIBLE_RUG',
          severity: 'CRITICAL',
          description: 'low liq, no holders',
        },
      ],
      liquidityUsd: 5_000,
      marketCapUsd: 100_000,
      volume24hUsd: 10_000,
      holders: 100,
      sourceCount: 1,
      mentionCount: 1,
      sourceChannelIds: [],
    });

    // base 50 + liq 5 + mc 5 + vol 2 + holders 8 = 70, then -15 = 55
    expect(view.score).toBeLessThan(60);
    expect(
      view.breakdown.find((b) => b.factor === 'SIGNAL_POSSIBLE_RUG')!.delta,
    ).toBe(-15);
  });

  it('reduces score for multiple HIGH signals', async () => {
    const rep = new FakeReputation();
    const useCase = new ScoreTokenUseCase(rep, repo, publisher);

    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      classification: 'TOKEN',
      signals: [
        { type: 'LOW_LIQUIDITY', severity: 'HIGH', description: 'x' },
        { type: 'MICROCAP', severity: 'HIGH', description: 'y' },
        { type: 'CONCENTRATED_HOLDERS', severity: 'HIGH', description: 'z' },
      ],
      liquidityUsd: 500,
      marketCapUsd: 500,
      holders: 5,
      sourceCount: 1,
      mentionCount: 1,
      sourceChannelIds: [],
    });

    // 50 - 10 (liq<1k) - 24 (3 HIGH signals) = 16
    expect(view.score).toBeLessThanOrEqual(16);
  });

  it('boosts score with multi-channel buzz', async () => {
    const rep = new FakeReputation();
    const useCase = new ScoreTokenUseCase(rep, repo, publisher);

    const single = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      classification: 'TOKEN',
      signals: [],
      liquidityUsd: 50_000,
      marketCapUsd: 100_000,
      holders: 500,
      sourceCount: 1,
      mentionCount: 1,
      sourceChannelIds: [],
    });

    const multi = await useCase.execute({
      chain: 'ethereum',
      address: '0x1111111111111111111111111111111111111111',
      classification: 'TOKEN',
      signals: [],
      liquidityUsd: 50_000,
      marketCapUsd: 100_000,
      holders: 500,
      sourceCount: 4,
      mentionCount: 8,
      sourceChannelIds: [],
    });

    expect(multi.score).toBeGreaterThan(single.score);
  });

  it('reputation multiplier boosts trusted channels', async () => {
    const trustedRep = new FakeReputation({ SpyDefi: 0.95 });
    const unknownRep = new FakeReputation({});
    const useCaseTrusted = new ScoreTokenUseCase(trustedRep, repo, publisher);
    const useCaseUnknown = new ScoreTokenUseCase(
      unknownRep,
      new InMemoryRepo(),
      new InMemoryPublisher(),
    );

    const trusted = await useCaseTrusted.execute({
      chain: 'ethereum',
      address: EVM,
      classification: 'TOKEN',
      signals: [],
      liquidityUsd: 50_000,
      marketCapUsd: 100_000,
      holders: 500,
      sourceCount: 1,
      mentionCount: 1,
      sourceChannelIds: ['SpyDefi'],
    });

    const unknown = await useCaseUnknown.execute({
      chain: 'ethereum',
      address: EVM,
      classification: 'TOKEN',
      signals: [],
      liquidityUsd: 50_000,
      marketCapUsd: 100_000,
      holders: 500,
      sourceCount: 1,
      mentionCount: 1,
      sourceChannelIds: ['unknown-channel'],
    });

    expect(trusted.score).toBeGreaterThan(unknown.score);
    expect(
      trusted.breakdown.find((b) => b.factor === 'CHANNEL_REPUTATION')!.delta,
    ).toBeGreaterThan(0);
  });

  it('clamps score to 100 max', async () => {
    const rep = new FakeReputation({ SpyDefi: 1.0 });
    const useCase = new ScoreTokenUseCase(rep, repo, publisher);

    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      classification: 'TOKEN',
      signals: [],
      liquidityUsd: 1_000_000,
      marketCapUsd: 100_000_000,
      volume24hUsd: 1_000_000,
      holders: 100_000,
      sourceCount: 10,
      mentionCount: 100,
      sourceChannelIds: ['SpyDefi'],
    });

    expect(view.score).toBeLessThanOrEqual(100);
  });

  it('persists score and publishes event', async () => {
    const rep = new FakeReputation();
    const useCase = new ScoreTokenUseCase(rep, repo, publisher);

    await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      classification: 'TOKEN',
      signals: [],
      liquidityUsd: 50_000,
      marketCapUsd: null,
      holders: null,
      sourceCount: 1,
      mentionCount: 1,
      sourceChannelIds: [],
    });

    expect(repo.store.size).toBe(1);
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0].eventName).toBe('scoring.token.scored');
  });

  it('breakdown has positive and negative factors', async () => {
    const rep = new FakeReputation();
    const useCase = new ScoreTokenUseCase(rep, repo, publisher);

    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      classification: 'TOKEN',
      signals: [{ type: 'NO_HOLDERS', severity: 'HIGH', description: 'x' }],
      liquidityUsd: 50_000,
      marketCapUsd: 1_000_000,
      holders: 0,
      sourceCount: 2,
      mentionCount: 2,
      sourceChannelIds: [],
    });

    const positives = view.breakdown.filter((b) => b.delta > 0).length;
    const negatives = view.breakdown.filter((b) => b.delta < 0).length;
    expect(positives).toBeGreaterThan(0);
    expect(negatives).toBeGreaterThan(0);
  });
});
