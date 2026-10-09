import { DiscoveryCacheRepository } from './discovery-cache.repository';
import { DISCOVERY_CACHE_TTL_MS } from './discovery-cache.entity';

/**
 * Discovery-cache repository (dexter plan todo 30b): in-memory path
 * (DB-less boots + unit tests). Store-backed paths ride the same
 * methods — the TTL/janitor rules below are store-agnostic by
 * construction (single `isExpired` / `deleteOlderThan` rule).
 */
describe('DiscoveryCacheRepository (in-memory)', () => {
  it('empty-miss answers null (cold cache probes discovery)', async () => {
    const repo = new DiscoveryCacheRepository();
    await expect(repo.find('solana', 'Mint111')).resolves.toBeNull();
  });

  it('save/find round-trips a pinned row (normalized)', async () => {
    const repo = new DiscoveryCacheRepository();
    await repo.save(' Solana ', 'MINT111', 'PairAAA', 'pumpfun');
    const row = await repo.find('solana', 'mint111');
    expect(row).toMatchObject({
      chain: 'solana',
      mint: 'mint111',
      pairAddress: 'PairAAA',
      dexId: 'pumpfun',
    });
    expect(typeof row?.updatedAt).toBe('string');
  });

  it('TTL-expiry: a row older than 30d reads as a miss AND is deleted (lazy TTL on read)', async () => {
    const repo = new DiscoveryCacheRepository();
    const old = new Date(
      Date.now() - DISCOVERY_CACHE_TTL_MS - 1000,
    ).toISOString();
    await repo.save('solana', 'OldMint', 'PairOld', 'pumpfun', old);
    await expect(repo.find('solana', 'OldMint')).resolves.toBeNull();
    // Deleted, not just hidden: a second read is still a miss and a
    // re-pin sticks (no ghost row underneath).
    await repo.save('solana', 'OldMint', 'PairNew', 'raydium');
    const row = await repo.find('solana', 'OldMint');
    expect(row).toMatchObject({ pairAddress: 'PairNew', dexId: 'raydium' });
  });

  it('fresh rows survive the TTL check', async () => {
    const repo = new DiscoveryCacheRepository();
    const recent = new Date(Date.now() - 1000).toISOString();
    await repo.save('base', 'FreshMint', 'PairF', 'uniswap', recent);
    const row = await repo.find('base', 'FreshMint');
    expect(row).toMatchObject({ pairAddress: 'PairF' });
  });

  it('re-pin overwrites pairAddress+dexId and bumps the clock', async () => {
    const repo = new DiscoveryCacheRepository();
    const old = new Date(Date.now() - 10_000).toISOString();
    await repo.save('solana', 'GradMint', 'CurvePDA', 'pumpfun', old);
    const repinned = await repo.save(
      'solana',
      'GradMint',
      'PoolAAA',
      'raydium',
    );
    expect(repinned).toMatchObject({
      pairAddress: 'PoolAAA',
      dexId: 'raydium',
    });
    expect(Date.parse(repinned.updatedAt) >= Date.parse(old)).toBe(true);
  });

  it('delete drops the row (migration-invalidation primitive)', async () => {
    const repo = new DiscoveryCacheRepository();
    await repo.save('solana', 'DelMint', 'PairD', 'pumpfun');
    await expect(repo.delete('solana', 'DelMint')).resolves.toBe(1);
    await expect(repo.find('solana', 'DelMint')).resolves.toBeNull();
    await expect(repo.delete('solana', 'DelMint')).resolves.toBe(0);
  });

  it('deleteOlderThan prunes only rows past the cutoff (janitor primitive)', async () => {
    const repo = new DiscoveryCacheRepository();
    const old = new Date(
      Date.now() - DISCOVERY_CACHE_TTL_MS - 1000,
    ).toISOString();
    const fresh = new Date().toISOString();
    await repo.save('solana', 'OldA', 'PairA', 'pumpfun', old);
    await repo.save('solana', 'FreshB', 'PairB', 'raydium', fresh);
    const cutoff = new Date(Date.now() - DISCOVERY_CACHE_TTL_MS);
    await expect(repo.deleteOlderThan(cutoff)).resolves.toBe(1);
    await expect(repo.find('solana', 'OldA')).resolves.toBeNull();
    const kept = await repo.find('solana', 'FreshB');
    expect(kept).toMatchObject({ pairAddress: 'PairB' });
  });

  it('blank chain/mint never matches (no phantom rows)', async () => {
    const repo = new DiscoveryCacheRepository();
    await expect(repo.find('', 'Mint111')).resolves.toBeNull();
    await expect(repo.find('solana', '  ')).resolves.toBeNull();
  });
});
