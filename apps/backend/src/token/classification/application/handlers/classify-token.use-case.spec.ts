import { ClassifyTokenUseCase } from 'token/classification/application/handlers/classify-token.use-case';
import { TokenClassificationRepository } from 'token/classification/application/ports/token-classification.repository';
import { ClassificationEventPublisher } from 'token/classification/application/ports/classification-event.publisher';
import { TokenClassification } from 'token/classification/domain/entities/token-classification.entity';
import { ChainId } from 'chain/identity/chain-id.vo';
import type { DomainEvent } from 'shared/kernel/domain-event';

class InMemoryRepo extends TokenClassificationRepository {
  public readonly store = new Map<string, TokenClassification>();
  public async save(c: TokenClassification): Promise<void> {
    await Promise.resolve();
    this.store.set(c.id, c);
  }
  public async findByChainAndAddress(
    c: ChainId,
    a: string,
  ): Promise<TokenClassification | null> {
    await Promise.resolve();
    return this.store.get(`${c.value}:${a.toLowerCase()}`) ?? null;
  }
  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<TokenClassification>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(-limit).reverse();
  }
}

class InMemoryPublisher extends ClassificationEventPublisher {
  public readonly published: DomainEvent[] = [];
  public async publish(e: DomainEvent): Promise<void> {
    await Promise.resolve();
    this.published.push(e);
  }
}

const EVM = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

describe('ClassifyTokenUseCase', () => {
  let repo: InMemoryRepo;
  let publisher: InMemoryPublisher;
  let useCase: ClassifyTokenUseCase;

  beforeEach(() => {
    repo = new InMemoryRepo();
    publisher = new InMemoryPublisher();
    useCase = new ClassifyTokenUseCase(repo, publisher);
  });

  it('classifies a healthy token as TOKEN with no risk signals', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      hasPairs: true,
      pairCount: 3,
      liquidityUsd: 50_000,
      marketCapUsd: 1_000_000,
      priceChange24h: 5,
      holders: 1000,
      top10HolderPercent: 30,
      hasName: true,
      hasTicker: true,
      completeness: 1,
    });

    expect(view.classification).toBe('TOKEN');
    expect(view.signals).toEqual([]);
    expect(view.highestSeverity).toBeNull();
    expect(view.confidence).toBeGreaterThan(0.8);
  });

  it('classifies as SCAM when liquidity < $100 AND 0 holders', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      hasPairs: true,
      pairCount: 1,
      liquidityUsd: 50,
      marketCapUsd: 1000,
      priceChange24h: null,
      holders: 0,
      top10HolderPercent: null,
      hasName: false,
      hasTicker: false,
      completeness: 0.6,
    });

    expect(view.classification).toBe('TOKEN');
    expect(view.securityFlag).toBe('SCAM');
    expect(view.signals.find((s) => s.type === 'POSSIBLE_RUG')).toBeDefined();
    expect(view.signals.find((s) => s.type === 'POSSIBLE_RUG')!.severity).toBe(
      'CRITICAL',
    );
    expect(view.signals.find((s) => s.type === 'LOW_LIQUIDITY')!.severity).toBe(
      'HIGH',
    );
  });

  it('classifies as UNKNOWN when no pairs, no holders, low completeness', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      hasPairs: false,
      pairCount: 0,
      liquidityUsd: null,
      marketCapUsd: null,
      priceChange24h: null,
      holders: null,
      top10HolderPercent: null,
      hasName: false,
      hasTicker: false,
      completeness: 0.1,
    });

    expect(view.classification).toBe('UNKNOWN');
    expect(view.signals.find((s) => s.type === 'NO_MARKET_DATA')).toBeDefined();
    expect(view.signals.find((s) => s.type === 'NO_HOLDERS')).toBeDefined();
  });

  it('flags LOW_LIQUIDITY MEDIUM when liquidity < $5000', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      hasPairs: true,
      pairCount: 2,
      liquidityUsd: 3000,
      marketCapUsd: 100_000,
      priceChange24h: null,
      holders: 200,
      top10HolderPercent: 30,
      hasName: true,
      hasTicker: true,
      completeness: 0.9,
    });

    expect(view.classification).toBe('TOKEN');
    expect(view.signals.find((s) => s.type === 'LOW_LIQUIDITY')!.severity).toBe(
      'MEDIUM',
    );
  });

  it('flags CONCENTRATED_HOLDERS HIGH when top10 > 80%', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      hasPairs: true,
      pairCount: 1,
      liquidityUsd: 50_000,
      marketCapUsd: 100_000,
      priceChange24h: null,
      holders: 50,
      top10HolderPercent: 95,
      hasName: true,
      hasTicker: true,
      completeness: 0.9,
    });

    expect(
      view.signals.find((s) => s.type === 'CONCENTRATED_HOLDERS')!.severity,
    ).toBe('HIGH');
  });

  it('flags EXTREME_PRICE_CHANGE HIGH when |change| > 500%', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      hasPairs: true,
      pairCount: 1,
      liquidityUsd: 50_000,
      marketCapUsd: 100_000,
      priceChange24h: 800,
      holders: 100,
      top10HolderPercent: 30,
      hasName: true,
      hasTicker: true,
      completeness: 0.9,
    });

    expect(
      view.signals.find((s) => s.type === 'EXTREME_PRICE_CHANGE')!.severity,
    ).toBe('HIGH');
  });

  it('flags MICROCAP HIGH when market cap < $1000', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      hasPairs: true,
      pairCount: 1,
      liquidityUsd: 50_000,
      marketCapUsd: 500,
      priceChange24h: null,
      holders: 100,
      top10HolderPercent: 30,
      hasName: true,
      hasTicker: true,
      completeness: 0.9,
    });

    expect(view.signals.find((s) => s.type === 'MICROCAP')!.severity).toBe(
      'HIGH',
    );
  });

  it('flags NO_HOLDERS HIGH when holders == 0', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      hasPairs: true,
      pairCount: 1,
      liquidityUsd: 50_000,
      marketCapUsd: 100_000,
      priceChange24h: null,
      holders: 0,
      top10HolderPercent: null,
      hasName: true,
      hasTicker: true,
      completeness: 0.8,
    });

    expect(view.signals.find((s) => s.type === 'NO_HOLDERS')!.severity).toBe(
      'HIGH',
    );
  });

  it('flags LOW_HOLDERS MEDIUM when 1 <= holders < 50', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      hasPairs: true,
      pairCount: 1,
      liquidityUsd: 50_000,
      marketCapUsd: 100_000,
      priceChange24h: null,
      holders: 20,
      top10HolderPercent: null,
      hasName: true,
      hasTicker: true,
      completeness: 0.8,
    });

    expect(view.signals.find((s) => s.type === 'NO_HOLDERS')).toBeUndefined();
    expect(view.signals.find((s) => s.type === 'LOW_HOLDERS')!.severity).toBe(
      'MEDIUM',
    );
    expect(
      view.signals.find((s) => s.type === 'LOW_HOLDERS')!.description,
    ).toBe('Only 20 holders (< 50)');
  });

  it('flags NO_NAME LOW when no ticker AND no name', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      hasPairs: true,
      pairCount: 1,
      liquidityUsd: 50_000,
      marketCapUsd: 100_000,
      priceChange24h: null,
      holders: 100,
      top10HolderPercent: 30,
      hasName: false,
      hasTicker: false,
      completeness: 0.9,
    });

    expect(view.signals.find((s) => s.type === 'NO_NAME')!.severity).toBe(
      'LOW',
    );
  });

  it('persists result and publishes event', async () => {
    await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      hasPairs: true,
      pairCount: 1,
      liquidityUsd: 50_000,
      marketCapUsd: 100_000,
      priceChange24h: null,
      holders: 100,
      top10HolderPercent: 30,
      hasName: true,
      hasTicker: true,
      completeness: 0.9,
    });

    expect(repo.store.size).toBe(1);
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0].eventName).toBe(
      'classification.token.classified',
    );
  });

  it('riskWeight aggregates signal weights', async () => {
    const view = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      hasPairs: true,
      pairCount: 1,
      liquidityUsd: 500, // HIGH (20)
      marketCapUsd: 500, // HIGH (20)
      priceChange24h: 800, // HIGH (20)
      holders: 20, // not 0 → NO_HOLDERS MEDIUM (10) (avoiding POSSIBLE_RUG)
      top10HolderPercent: 95, // HIGH (20)
      hasName: false,
      hasTicker: false,
      completeness: 0.7,
    });

    // 4 HIGH + 1 MEDIUM = 90 points
    expect(view.riskWeight).toBeGreaterThanOrEqual(80);
    expect(view.highestSeverity).toBe('HIGH');
  });

  it('confidence drops when many high-severity signals present', async () => {
    const risky = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
      hasPairs: true,
      pairCount: 1,
      liquidityUsd: 500,
      marketCapUsd: 500,
      priceChange24h: 800,
      holders: 20, // > 10 to avoid POSSIBLE_RUG (we want TOKEN classification here)
      top10HolderPercent: 95,
      hasName: false,
      hasTicker: false,
      completeness: 0.5,
    });
    const healthy = await useCase.execute({
      chain: 'ethereum',
      address: '0x1111111111111111111111111111111111111111',
      hasPairs: true,
      pairCount: 3,
      liquidityUsd: 100_000,
      marketCapUsd: 1_000_000,
      priceChange24h: 5,
      holders: 5000,
      top10HolderPercent: 25,
      hasName: true,
      hasTicker: true,
      completeness: 1,
    });

    expect(risky.confidence).toBeLessThan(healthy.confidence);
  });
});
