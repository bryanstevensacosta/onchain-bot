import {
  AmbiguousAssetError,
  AssetNotFoundError,
} from 'asset-registry/domain/asset-record';
import { InMemoryAssetRegistryRepository } from 'asset-registry/infrastructure/in-memory-asset-registry.repository';
import { AssetResolverService } from 'asset-registry/application/asset-resolver.service';

function seed() {
  const repo = new InMemoryAssetRegistryRepository();
  return { repo, resolver: new AssetResolverService(repo) };
}

describe('AssetResolverService (failing-first)', () => {
  it('resolves by contract+chain first even when ids overlap', async () => {
    const { repo, resolver } = seed();
    await repo.upsert({
      chain: 'solana',
      contract: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      symbol: 'JUP',
      name: 'Jupiter',
      cmcId: 29210,
      geckoId: 'jupiter',
      providerIds: { birdeye: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN' },
      logoUrl: null,
      categories: ['dex'],
    });
    const found = await resolver.resolve({
      chain: 'solana',
      contract: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    });
    expect(found.symbol).toBe('JUP');
    expect(found.cmcId).toBe(29210);
  });

  it('resolves by cmc id and by gecko id (multi-id matching)', async () => {
    const { repo, resolver } = seed();
    await repo.upsert({
      chain: 'solana',
      contract: 'AAA',
      symbol: 'JUP',
      name: 'Jupiter',
      cmcId: 29210,
      geckoId: 'jupiter',
      providerIds: {},
      logoUrl: null,
      categories: [],
    });
    await expect(resolver.resolveByCmcId(29210)).resolves.toMatchObject({
      symbol: 'JUP',
    });
    await expect(resolver.resolveByGeckoId('JUPITER')).resolves.toMatchObject({
      symbol: 'JUP',
    });
  });

  it('throws AssetNotFoundError on unknown contract / cmc / gecko', async () => {
    const { resolver } = seed();
    await expect(
      resolver.resolve({ chain: 'solana', contract: 'nope' }),
    ).rejects.toBeInstanceOf(AssetNotFoundError);
    await expect(resolver.resolveByCmcId(1)).rejects.toBeInstanceOf(
      AssetNotFoundError,
    );
    await expect(resolver.resolveByGeckoId('nope')).rejects.toBeInstanceOf(
      AssetNotFoundError,
    );
  });

  it('never silently picks on symbol collision: same symbol+chain without contract throws', async () => {
    const { repo, resolver } = seed();
    await repo.upsert({
      chain: 'bsc',
      contract: '0x111',
      symbol: 'SECT',
      name: 'Sector A',
      cmcId: null,
      geckoId: null,
      providerIds: {},
      logoUrl: null,
      categories: [],
    });
    await repo.upsert({
      chain: 'bsc',
      contract: '0x222',
      symbol: 'SECT',
      name: 'Sector B',
      cmcId: null,
      geckoId: null,
      providerIds: {},
      logoUrl: null,
      categories: [],
    });
    await expect(
      resolver.resolveBySymbol('bsc', 'SECT'),
    ).rejects.toBeInstanceOf(AmbiguousAssetError);
  });

  it('resolves a unique symbol+chain without ambiguity', async () => {
    const { repo, resolver } = seed();
    await repo.upsert({
      chain: 'solana',
      contract: 'BBB',
      symbol: 'JUP',
      name: 'Jupiter',
      cmcId: null,
      geckoId: null,
      providerIds: {},
      logoUrl: null,
      categories: [],
    });
    await expect(
      resolver.resolveBySymbol('solana', 'jup'),
    ).resolves.toMatchObject({ contract: 'bbb' });
  });
});
