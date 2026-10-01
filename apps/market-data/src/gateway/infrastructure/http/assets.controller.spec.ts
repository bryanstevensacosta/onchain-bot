import { AssetsController } from './assets.controller';
import { InMemoryAssetRegistryRepository } from 'asset-registry/infrastructure/in-memory-asset-registry.repository';
import { AssetResolverService } from 'asset-registry/application/asset-resolver.service';

describe('AssetsController (failing-first)', () => {
  it('resolves by contract, cmc id and gecko id', async () => {
    const repo = new InMemoryAssetRegistryRepository();
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
    const controller = new AssetsController(new AssetResolverService(repo));
    await expect(controller.resolve('solana', 'AAA')).resolves.toMatchObject({
      symbol: 'JUP',
    });
    await expect(controller.resolveByCmc('29210')).resolves.toMatchObject({
      symbol: 'JUP',
    });
    await expect(controller.resolveByGecko('jupiter')).resolves.toMatchObject({
      symbol: 'JUP',
    });
  });
});
