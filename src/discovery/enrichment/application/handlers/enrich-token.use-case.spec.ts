import { EnrichTokenUseCase } from 'discovery/enrichment/application/handlers/enrich-token.use-case';
import { TokenSnapshotRepository } from 'discovery/enrichment/application/ports/token-snapshot.repository';
import { EnrichmentEventPublisher } from 'discovery/enrichment/application/ports/enrichment-event.publisher';
import {
  MarketData,
  MarketDataProviderPort,
} from 'discovery/enrichment/domain/ports/market-data-provider.port';
import { TokenSnapshot } from 'discovery/enrichment/domain/entities/token-snapshot.entity';
import { ChainId } from 'shared/common/value-objects/chain-id.vo';
import type { DomainEvent } from 'shared/kernel/domain-event';

class FakeProvider extends MarketDataProviderPort {
  public constructor(
    public readonly name: string,
    public readonly supportedChains: ReadonlyArray<ChainId>,
    private readonly nextResult: MarketData | null,
    private readonly shouldThrow = false,
  ) {
    super();
  }
  public fetch(): Promise<MarketData | null> {
    if (this.shouldThrow) return Promise.reject(new Error(`${this.name} down`));
    return Promise.resolve(this.nextResult);
  }
}

class InMemoryRepo extends TokenSnapshotRepository {
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
    return this.store.get(`${c.value}:${a.toLowerCase()}`) ?? null;
  }
  public async findRecent(
    limit: number,
  ): Promise<ReadonlyArray<TokenSnapshot>> {
    await Promise.resolve();
    return Array.from(this.store.values()).slice(-limit).reverse();
  }
}

class InMemoryPublisher extends EnrichmentEventPublisher {
  public readonly published: DomainEvent[] = [];
  public async publish(e: DomainEvent): Promise<void> {
    await Promise.resolve();
    this.published.push(e);
  }
}

const EVM = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

describe('EnrichTokenUseCase', () => {
  let repo: InMemoryRepo;
  let publisher: InMemoryPublisher;

  beforeEach(() => {
    repo = new InMemoryRepo();
    publisher = new InMemoryPublisher();
  });

  it('merges data from multiple providers (first non-null wins)', async () => {
    const providers = [
      new FakeProvider('dexscreener', [ChainId.ETHEREUM], {
        pairs: [
          {
            address: 'p1',
            dexId: 'uniswap',
            quoteToken: 'USDC',
            reserveUsd: 50_000,
          },
        ],
        priceUsd: 0.0001,
        liquidityUsd: 50_000,
        volume24hUsd: 10_000,
        marketCapUsd: null,
        fdvUsd: null,
        priceChange24h: 5,
        holders: null,
        top10HolderPercent: null,
      }),
      new FakeProvider('geckoterminal', [ChainId.ETHEREUM], {
        pairs: [],
        priceUsd: null,
        liquidityUsd: null,
        volume24hUsd: null,
        marketCapUsd: 100_000,
        fdvUsd: 1_000_000,
        priceChange24h: null,
        holders: 1234,
        top10HolderPercent: 22.5,
      }),
    ];
    const useCase = new EnrichTokenUseCase(providers, repo, publisher);

    const { snapshot, errors } = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
    });

    expect(errors).toEqual([]);
    expect(snapshot.priceUsd).toBe(0.0001); // from dexscreener
    expect(snapshot.marketCapUsd).toBe(100_000); // from geckoterminal
    expect(snapshot.holders).toBe(1234); // from geckoterminal
    expect(snapshot.top10HolderPercent).toBe(22.5); // from geckoterminal
    expect(snapshot.sources).toEqual(['dexscreener', 'geckoterminal']);
    expect(snapshot.primaryPair?.address).toBe('p1');
    expect(repo.store.size).toBe(1);
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0].eventName).toBe('enrichment.token.enriched');
  });

  it('emits EnrichmentFailedEvent when all providers fail', async () => {
    const providers = [
      new FakeProvider('dexscreener', [ChainId.ETHEREUM], null),
      new FakeProvider('geckoterminal', [ChainId.ETHEREUM], null),
    ];
    const useCase = new EnrichTokenUseCase(providers, repo, publisher);

    const { snapshot, errors } = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
    });

    expect(snapshot.priceUsd).toBeNull();
    expect(errors).toHaveLength(2);
    expect(publisher.published).toHaveLength(1);
    expect(publisher.published[0].eventName).toBe('enrichment.token.failed');
  });

  it('absorbs provider rejections via Promise.allSettled', async () => {
    const providers = [
      new FakeProvider('dexscreener', [ChainId.ETHEREUM], null, true),
      new FakeProvider('geckoterminal', [ChainId.ETHEREUM], {
        pairs: [],
        priceUsd: 0.001,
        liquidityUsd: 10_000,
        volume24hUsd: null,
        marketCapUsd: null,
        fdvUsd: null,
        priceChange24h: null,
        holders: null,
        top10HolderPercent: null,
      }),
    ];
    const useCase = new EnrichTokenUseCase(providers, repo, publisher);

    const { snapshot, errors } = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
    });

    expect(snapshot.priceUsd).toBe(0.001); // from geckoterminal
    expect(errors).toHaveLength(1);
    expect(errors[0].provider).toBe('dexscreener');
  });

  it('skips providers that do not support the requested chain', async () => {
    const providers = [
      new FakeProvider('birdeye', [ChainId.SOLANA], {
        pairs: [],
        priceUsd: 1.5,
        liquidityUsd: 100_000,
        volume24hUsd: 50_000,
        marketCapUsd: null,
        fdvUsd: null,
        priceChange24h: 10,
        holders: null,
        top10HolderPercent: null,
      }),
    ];
    const useCase = new EnrichTokenUseCase(providers, repo, publisher);

    const { snapshot, errors } = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
    });

    // Birdeye is excluded from `applicable` (only supports solana),
    // so it doesn't run and doesn't count as an error.
    expect(snapshot.priceUsd).toBeNull();
    expect(errors).toHaveLength(0);
  });

  it('returns cached snapshot within maxAgeMs', async () => {
    const providers = [
      new FakeProvider('dexscreener', [ChainId.ETHEREUM], {
        pairs: [],
        priceUsd: 0.0001,
        liquidityUsd: 50_000,
        volume24hUsd: null,
        marketCapUsd: null,
        fdvUsd: null,
        priceChange24h: null,
        holders: null,
        top10HolderPercent: null,
      }),
    ];
    const useCase = new EnrichTokenUseCase(providers, repo, publisher);

    const v1 = await useCase.execute({ chain: 'ethereum', address: EVM });
    const v2 = await useCase.execute({ chain: 'ethereum', address: EVM });

    expect(v1.snapshot.enrichedAt).toBe(v2.snapshot.enrichedAt);
    expect(repo.store.size).toBe(1);
  });

  it('force=true bypasses cache', async () => {
    const providers = [
      new FakeProvider('dexscreener', [ChainId.ETHEREUM], {
        pairs: [],
        priceUsd: 0.0001,
        liquidityUsd: 50_000,
        volume24hUsd: null,
        marketCapUsd: null,
        fdvUsd: null,
        priceChange24h: null,
        holders: null,
        top10HolderPercent: null,
      }),
    ];
    const useCase = new EnrichTokenUseCase(providers, repo, publisher);

    await useCase.execute({ chain: 'ethereum', address: EVM });
    await new Promise((r) => setTimeout(r, 5));
    await useCase.execute({ chain: 'ethereum', address: EVM, force: true });

    expect(repo.store.size).toBe(1);
    expect(publisher.published.length).toBeGreaterThanOrEqual(2);
  });

  it('dedupes pairs across providers (same dexId:address, keep highest reserveUsd)', async () => {
    const providers = [
      new FakeProvider('dexscreener', [ChainId.ETHEREUM], {
        pairs: [
          {
            address: 'p1',
            dexId: 'uniswap',
            quoteToken: 'USDC',
            reserveUsd: 10_000,
          },
          {
            address: 'p2',
            dexId: 'uniswap',
            quoteToken: 'USDC',
            reserveUsd: 50_000,
          },
        ],
        priceUsd: 1,
        liquidityUsd: null,
        volume24hUsd: null,
        marketCapUsd: null,
        fdvUsd: null,
        priceChange24h: null,
        holders: null,
        top10HolderPercent: null,
      }),
      new FakeProvider('geckoterminal', [ChainId.ETHEREUM], {
        pairs: [
          {
            address: 'p1',
            dexId: 'uniswap',
            quoteToken: 'USDC',
            reserveUsd: 99_000,
          },
        ],
        priceUsd: null,
        liquidityUsd: null,
        volume24hUsd: null,
        marketCapUsd: null,
        fdvUsd: null,
        priceChange24h: null,
        holders: null,
        top10HolderPercent: null,
      }),
    ];
    const useCase = new EnrichTokenUseCase(providers, repo, publisher);

    const { snapshot } = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
    });

    // p1 wins because it has the highest reserveUsd (99k) after dedup
    expect(snapshot.primaryPair?.address).toBe('p1');
    expect(snapshot.primaryPair?.reserveUsd).toBe(99_000);
    expect(snapshot.pairCount).toBe(2);
  });

  it('throws when no providers are registered', () => {
    expect(() => new EnrichTokenUseCase([], repo, publisher)).toThrow();
  });
});
