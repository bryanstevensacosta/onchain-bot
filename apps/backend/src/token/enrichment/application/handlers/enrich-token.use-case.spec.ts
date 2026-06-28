import { EnrichTokenUseCase } from './enrich-token.use-case';
import { TokenSnapshotRepository } from '../ports/token-snapshot.repository';
import { EnrichmentEventPublisher } from '../ports/enrichment-event.publisher';
import {
  MarketData,
  MarketDataProviderPort,
} from '../../domain/ports/market-data-provider.port';
import { TokenSnapshot } from '../../domain/entities/token-snapshot.entity';
import { ChainId } from 'chain/identity/chain-id.vo';
import { Chain } from 'chain/registry/domain/entities/chain.entity';
import {
  CHAIN_CATALOG,
  ChainCatalogPort,
} from 'chain/registry/domain/ports/chain-catalog.port';
import { ChainCapabilities } from 'chain/registry/domain/value-objects/chain-capabilities.vo';
import { StaticChainCatalogRepository } from 'chain/registry/infrastructure/repositories/static-chain-catalog.repository';
import type { DomainEvent } from 'shared/kernel/domain-event';

class FakeProvider extends MarketDataProviderPort {
  public constructor(
    public readonly name: string,
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

class CatalogWithCapabilities implements ChainCatalogPort {
  public readonly byCapabilities = new Map<string, ReadonlyArray<Capability>>();

  public constructor(
    private readonly fallback: ChainCatalogPort = new StaticChainCatalogRepository(),
  ) {}

  public allow(id: ChainId, caps: ReadonlyArray<Capability>): void {
    this.byCapabilities.set(id.value, caps);
  }

  public async findById(id: ChainId): Promise<Chain | null> {
    const chain = await this.fallback.findById(id);
    if (!chain) return null;
    const caps = this.byCapabilities.get(id.value);
    if (!caps) return chain;
    return Chain.create(id, {
      ...chain['state'],
      capabilities: ChainCapabilities.of(caps),
    });
  }

  public async listByFamily(
    family: Parameters<ChainCatalogPort['listByFamily']>[0],
  ) {
    return this.fallback.listByFamily(family);
  }

  public async listAll() {
    return this.fallback.listAll();
  }

  public async listSupporting(
    c: Parameters<ChainCatalogPort['listSupporting']>[0],
  ) {
    return this.fallback.listSupporting(c);
  }
}

type Capability = Parameters<ChainCatalogPort['listSupporting']>[0];

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
  let catalog: CatalogWithCapabilities;

  beforeEach(() => {
    repo = new InMemoryRepo();
    publisher = new InMemoryPublisher();
    catalog = new CatalogWithCapabilities();
    catalog.allow(ChainId.ETHEREUM, ['MARKET_DATA']);
  });

  it('merges data from multiple providers (first non-null wins)', async () => {
    const providers = [
      new FakeProvider('dexscreener', {
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
        name: null,
        imageUrls: [],
        lockedLiquidityPercent: null,
        burnedPercent: null,
      }),
      new FakeProvider('geckoterminal', {
        pairs: [],
        priceUsd: null,
        liquidityUsd: null,
        volume24hUsd: null,
        marketCapUsd: 100_000,
        fdvUsd: 1_000_000,
        priceChange24h: null,
        holders: 1234,
        top10HolderPercent: 22.5,
        name: null,
        imageUrls: [],
        lockedLiquidityPercent: null,
        burnedPercent: null,
      }),
    ];
    const useCase = new EnrichTokenUseCase(providers, catalog, repo, publisher);

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
      new FakeProvider('dexscreener', null),
      new FakeProvider('geckoterminal', null),
    ];
    const useCase = new EnrichTokenUseCase(providers, catalog, repo, publisher);

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
      new FakeProvider('dexscreener', null, true),
      new FakeProvider('geckoterminal', {
        pairs: [],
        priceUsd: 0.001,
        liquidityUsd: 10_000,
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
      }),
    ];
    const useCase = new EnrichTokenUseCase(providers, catalog, repo, publisher);

    const { snapshot, errors } = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
    });

    expect(snapshot.priceUsd).toBe(0.001); // from geckoterminal
    expect(errors).toHaveLength(1);
    expect(errors[0].provider).toBe('dexscreener');
  });

  it('returns empty when chain lacks MARKET_DATA capability', async () => {
    catalog.allow(ChainId.ETHEREUM, []);
    const providers = [
      new FakeProvider('dexscreener', {
        pairs: [],
        priceUsd: 1.5,
        liquidityUsd: 100_000,
        volume24hUsd: 50_000,
        marketCapUsd: null,
        fdvUsd: null,
        priceChange24h: 10,
        holders: null,
        top10HolderPercent: null,
        name: null,
        imageUrls: [],
        lockedLiquidityPercent: null,
        burnedPercent: null,
      }),
    ];
    const useCase = new EnrichTokenUseCase(providers, catalog, repo, publisher);

    const { snapshot, errors } = await useCase.execute({
      chain: 'ethereum',
      address: EVM,
    });

    expect(snapshot.priceUsd).toBeNull();
    expect(errors).toHaveLength(0);
  });

  it('returns cached snapshot within maxAgeMs', async () => {
    const providers = [
      new FakeProvider('dexscreener', {
        pairs: [],
        priceUsd: 0.0001,
        liquidityUsd: 50_000,
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
      }),
    ];
    const useCase = new EnrichTokenUseCase(providers, catalog, repo, publisher);

    const v1 = await useCase.execute({ chain: 'ethereum', address: EVM });
    const v2 = await useCase.execute({ chain: 'ethereum', address: EVM });

    expect(v1.snapshot.enrichedAt).toBe(v2.snapshot.enrichedAt);
    expect(repo.store.size).toBe(1);
  });

  it('force=true bypasses cache', async () => {
    const providers = [
      new FakeProvider('dexscreener', {
        pairs: [],
        priceUsd: 0.0001,
        liquidityUsd: 50_000,
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
      }),
    ];
    const useCase = new EnrichTokenUseCase(providers, catalog, repo, publisher);

    await useCase.execute({ chain: 'ethereum', address: EVM });
    await new Promise((r) => setTimeout(r, 5));
    await useCase.execute({ chain: 'ethereum', address: EVM, force: true });

    expect(repo.store.size).toBe(1);
    expect(publisher.published.length).toBeGreaterThanOrEqual(2);
  });

  it('dedupes pairs across providers (same dexId:address, keep highest reserveUsd)', async () => {
    const providers = [
      new FakeProvider('dexscreener', {
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
        name: null,
        imageUrls: [],
        lockedLiquidityPercent: null,
        burnedPercent: null,
      }),
      new FakeProvider('geckoterminal', {
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
        name: null,
        imageUrls: [],
        lockedLiquidityPercent: null,
        burnedPercent: null,
      }),
    ];
    const useCase = new EnrichTokenUseCase(providers, catalog, repo, publisher);

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
    expect(
      () => new EnrichTokenUseCase([], catalog, repo, publisher),
    ).toThrow();
  });

  it("maps generic 'evm' chain hint to 'ethereum' (v1 normalization alias)", async () => {
    const providers = [
      new FakeProvider('dexscreener', {
        pairs: [],
        priceUsd: 0.0001,
        liquidityUsd: 50_000,
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
      }),
    ];
    const useCase = new EnrichTokenUseCase(providers, catalog, repo, publisher);

    const { snapshot, errors } = await useCase.execute({
      chain: 'evm',
      address: EVM,
    });

    expect(errors).toEqual([]);
    expect(snapshot.priceUsd).toBe(0.0001);
    expect(repo.store.size).toBe(1);
    expect(publisher.published[0].eventName).toBe('enrichment.token.enriched');
  });
});

// Re-export to satisfy type-only imports
export type { ChainCatalogPort };
export { CHAIN_CATALOG };
