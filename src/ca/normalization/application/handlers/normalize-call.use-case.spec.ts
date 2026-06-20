import { NormalizeCallUseCase } from 'ca/normalization/application/handlers/normalize-call.use-case';
import { CanonicalTokenCallRepository } from 'ca/normalization/application/ports/canonical-token-call.repository';
import { NormalizationEventPublisher } from 'ca/normalization/application/ports/normalization-event.publisher';
import { CanonicalTokenCall } from 'ca/normalization/domain/entities/canonical-token-call.entity';
import { Chain } from 'ca/normalization/domain/value-objects/chain.vo';
import { NormalizedAddress } from 'ca/normalization/domain/value-objects/normalized-address.vo';
import { TokenMetrics } from 'shared/common/value-objects/token-metrics.vo';
import type { DomainEvent } from 'shared/kernel/domain-event';

class InMemoryRepo extends CanonicalTokenCallRepository {
  public readonly store = new Map<string, CanonicalTokenCall>();
  public saves: CanonicalTokenCall[] = [];
  public async save(c: CanonicalTokenCall): Promise<void> {
    await Promise.resolve();
    this.store.set(c.id, c);
    this.saves.push(c);
  }
  public async findByIdentity(
    chain: Chain,
    address: NormalizedAddress,
  ): Promise<CanonicalTokenCall | null> {
    await Promise.resolve();
    return this.store.get(`${chain.value}:${address.value}`) ?? null;
  }
  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<CanonicalTokenCall>> {
    await Promise.resolve();
    return Array.from(this.store.values())
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .slice(0, limit);
  }
}

class InMemoryPublisher extends NormalizationEventPublisher {
  public readonly published: DomainEvent[] = [];
  public async publish(event: DomainEvent): Promise<void> {
    await Promise.resolve();
    this.published.push(event);
  }
}

describe('NormalizeCallUseCase', () => {
  let repo: InMemoryRepo;
  let publisher: InMemoryPublisher;
  let useCase: NormalizeCallUseCase;
  const EVM = '0xabcdef0123456789abcdef0123456789abcdef01';
  const FIXED_DATE = new Date('2026-01-01T00:00:00Z');

  beforeEach(() => {
    repo = new InMemoryRepo();
    publisher = new InMemoryPublisher();
    useCase = new NormalizeCallUseCase(repo, publisher);
  });

  it('creates a new canonical call on first sight', async () => {
    const view = await useCase.execute({
      chainHint: 'evm',
      addressRaw: EVM,
      ticker: 'WIF',
      name: null,
      chart: null,
      metrics: TokenMetrics.create({
        marketCapUsd: 100_000,
        liquidityUsd: null,
        fdvUsd: null,
        holders: null,
      }),
      confidence: 0.85,
      channelId: 'chan-A',
      username: 'SpyDefi',
      messageId: 1,
      occurredAt: FIXED_DATE,
    });

    expect(view).not.toBeNull();
    expect(view!.mentionCount).toBe(1);
    expect(view!.sourceCount).toBe(1);
    expect(view!.ticker).toBe('WIF');
    expect(view!.chain).toBe('evm');
    expect(view!.address).toBe(EVM);
    expect(repo.saves).toHaveLength(1);
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0].eventName).toBe(
      'normalization.call.normalized',
    );
  });

  it('merges with existing canonical call on second mention', async () => {
    await useCase.execute({
      chainHint: 'evm',
      addressRaw: EVM,
      ticker: 'WIF',
      name: null,
      chart: null,
      metrics: TokenMetrics.create({
        marketCapUsd: 100_000,
        liquidityUsd: null,
        fdvUsd: null,
        holders: null,
      }),
      confidence: 0.5,
      channelId: 'chan-A',
      username: null,
      messageId: 1,
      occurredAt: FIXED_DATE,
    });

    const view = await useCase.execute({
      chainHint: 'evm',
      addressRaw: EVM,
      ticker: 'WIF',
      name: null,
      chart: null,
      metrics: TokenMetrics.create({
        marketCapUsd: 200_000,
        liquidityUsd: null,
        fdvUsd: null,
        holders: null,
      }),
      confidence: 0.9,
      channelId: 'chan-B',
      username: null,
      messageId: 2,
      occurredAt: new Date('2026-01-02T00:00:00Z'),
    });

    expect(view!.mentionCount).toBe(2);
    expect(view!.sourceCount).toBe(2);
    expect(view!.metrics.marketCapUsd).toBe(200_000); // newer mention wins
    expect(publisher.published).toHaveLength(2); // both calls published
  });

  it('returns null for unsupported chain hint', async () => {
    const view = await useCase.execute({
      chainHint: 'sui',
      addressRaw: '0xnope',
      ticker: null,
      name: null,
      chart: null,
      metrics: TokenMetrics.empty(),
      confidence: 0.5,
      channelId: 'chan-A',
      username: null,
      messageId: 1,
      occurredAt: FIXED_DATE,
    });

    expect(view).toBeNull();
    expect(repo.saves).toHaveLength(0);
    expect(publisher.published).toHaveLength(0);
  });

  it('returns null when address invalid for chain', async () => {
    const view = await useCase.execute({
      chainHint: 'evm',
      addressRaw: '0xnope',
      ticker: null,
      name: null,
      chart: null,
      metrics: TokenMetrics.empty(),
      confidence: 0.5,
      channelId: 'chan-A',
      username: null,
      messageId: 1,
      occurredAt: FIXED_DATE,
    });

    expect(view).toBeNull();
  });

  it('treats mixed-case EVM as same identity', async () => {
    await useCase.execute({
      chainHint: 'evm',
      addressRaw: EVM,
      ticker: 'WIF',
      name: null,
      chart: null,
      metrics: TokenMetrics.empty(),
      confidence: 0.5,
      channelId: 'chan-A',
      username: null,
      messageId: 1,
      occurredAt: FIXED_DATE,
    });

    const view = await useCase.execute({
      chainHint: 'evm',
      addressRaw: EVM.toUpperCase(),
      ticker: 'WIF',
      name: null,
      chart: null,
      metrics: TokenMetrics.empty(),
      confidence: 0.5,
      channelId: 'chan-B',
      username: null,
      messageId: 1,
      occurredAt: FIXED_DATE,
    });

    expect(view!.mentionCount).toBe(2);
    expect(view!.sourceCount).toBe(2);
  });
});
