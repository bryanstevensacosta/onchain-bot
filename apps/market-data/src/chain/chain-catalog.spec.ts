import { StaticChainCatalog } from './static-chain-catalog';

/**
 * Failing-first spec (Tramo 3, todo 2): static chain catalog.
 *
 * Mirrors the backend STATIC_CHAINS shape (read-only reference):
 * 6 chains, lookup by id + family filter.
 */
describe('StaticChainCatalog', () => {
  const catalog = new StaticChainCatalog();

  it('lists at least 6 chains (ethereum + solana + EVM L2s)', async () => {
    const all = await catalog.listAll();
    expect(all.length).toBeGreaterThanOrEqual(6);
  });

  it('finds ethereum and solana by id', async () => {
    const eth = await catalog.findById('ethereum');
    const sol = await catalog.findById('solana');
    expect(eth?.displayName).toBe('Ethereum');
    expect(sol?.displayName).toBe('Solana');
  });

  it('returns null for an unknown chain', async () => {
    await expect(catalog.findById('nope')).resolves.toBeNull();
  });

  it('filters by EVM family', async () => {
    const evm = await catalog.listByFamily('EVM');
    expect(evm.length).toBeGreaterThan(0);
    for (const chain of evm) {
      expect(chain.family).toBe('EVM');
    }
  });
});
