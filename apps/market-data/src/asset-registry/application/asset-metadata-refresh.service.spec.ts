import { InMemoryAssetRegistryRepository } from 'asset-registry/infrastructure/in-memory-asset-registry.repository';
import { AssetMetadataRefreshService } from 'asset-registry/application/asset-metadata-refresh.service';

describe('AssetMetadataRefreshService (failing-first)', () => {
  it('refreshes stale rows sequentially with a per-item delay (rate-limit aware)', async () => {
    const repo = new InMemoryAssetRegistryRepository();
    await repo.upsert({
      chain: 'solana',
      contract: 'AAA',
      symbol: 'AAA',
      name: 'Old name',
      cmcId: null,
      geckoId: null,
      providerIds: {},
      logoUrl: null,
      categories: [],
    });
    const seen: Array<string> = [];
    const svc = new AssetMetadataRefreshService(repo, {
      intervalMs: 60_000,
      batchSize: 10,
      delayBetweenItemsMs: 5,
      fetchMetadata: async (row) => {
        seen.push(row.contract);
        return { name: 'New name ' + row.contract };
      },
    });
    const refreshed = await svc.refreshOnce();
    expect(refreshed).toBe(1);
    expect(seen).toEqual(['aaa']);
    const after = await repo.findByContract('solana', 'AAA');
    expect(after?.name).toBe('New name aaa');
  });

  it('exposes the configured interval and starts/stops the timer', () => {
    const repo = new InMemoryAssetRegistryRepository();
    const svc = new AssetMetadataRefreshService(repo, { intervalMs: 1234 });
    expect(svc.getIntervalMs()).toBe(1234);
    svc.start();
    svc.stop();
  });
});
