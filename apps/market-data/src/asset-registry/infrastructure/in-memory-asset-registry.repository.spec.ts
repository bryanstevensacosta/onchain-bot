import { InMemoryAssetRegistryRepository } from './in-memory-asset-registry.repository';

describe('InMemoryAssetRegistryRepository (failing-first)', () => {
  it('upserts by chain+contract and matches every id kind', async () => {
    const repo = new InMemoryAssetRegistryRepository();
    await repo.upsert({
      chain: 'Solana',
      contract: 'AAA',
      symbol: 'JUP',
      name: 'Jupiter',
      cmcId: 29210,
      geckoId: 'Jupiter',
      providerIds: { dexscreener: 'AAA' },
      logoUrl: null,
      categories: [],
    });
    await expect(repo.findByContract('solana', 'aaa')).resolves.toMatchObject({ symbol: 'JUP' });
    await expect(repo.findByCmcId(29210)).resolves.toMatchObject({ symbol: 'JUP' });
    await expect(repo.findByGeckoId('jupiter')).resolves.toMatchObject({ symbol: 'JUP' });
    await expect(repo.findBySymbol('solana', 'JUP')).resolves.toHaveLength(1);
  });

  it('re-upsert keeps one row per chain+contract (PK-ish)', async () => {
    const repo = new InMemoryAssetRegistryRepository();
    await repo.upsert({
      chain: 'bsc',
      contract: '0xabc',
      symbol: 'OLD',
      name: 'Old',
      cmcId: null,
      geckoId: null,
      providerIds: {},
      logoUrl: null,
      categories: [],
    });
    await repo.upsert({
      chain: 'bsc',
      contract: '0xABC',
      symbol: 'NEW',
      name: 'New',
      cmcId: 1,
      geckoId: 'new',
      providerIds: {},
      logoUrl: null,
      categories: [],
    });
    const rows = await repo.findBySymbol('bsc', 'NEW');
    expect(rows).toHaveLength(1);
    expect(rows[0].cmcId).toBe(1);
  });
});
