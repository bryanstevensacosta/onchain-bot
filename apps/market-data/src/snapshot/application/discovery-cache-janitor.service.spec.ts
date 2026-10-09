import { DISCOVERY_CACHE_TTL_DAYS } from '../infrastructure/discovery-cache.entity';
import { DiscoveryCacheRepository } from '../infrastructure/discovery-cache.repository';
import { DiscoveryCacheJanitorService } from './discovery-cache-janitor.service';
import { SNAPSHOT_HISTORY_RETENTION_DAYS } from '../infrastructure/snapshot-history.entity';

/**
 * Discovery-cache janitor (dexter plan todo 30b): 30d retention.
 */
describe('DiscoveryCacheJanitorService (30d retention)', () => {
  it('pins the 30d bound (contrast: history keeps 90d)', () => {
    expect(DISCOVERY_CACHE_TTL_DAYS).toBe(30);
    expect(SNAPSHOT_HISTORY_RETENTION_DAYS).toBe(90);
  });

  it('prunes rows older than 30d and keeps fresh rows', async () => {
    const cache = new DiscoveryCacheRepository();
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await cache.save('solana', 'OldMint', 'PairOld', 'pumpfun', old);
    await cache.save('solana', 'FreshMint', 'PairFresh', 'raydium');
    const janitor = new DiscoveryCacheJanitorService(cache);
    const outcome = await janitor.run();
    expect(outcome.deleted).toBe(1);
    await expect(cache.find('solana', 'OldMint')).resolves.toBeNull();
    const kept = await cache.find('solana', 'FreshMint');
    expect(kept).toMatchObject({ pairAddress: 'PairFresh' });
  });

  it('empty cache deletes nothing (cutoff still reported)', async () => {
    const janitor = new DiscoveryCacheJanitorService(
      new DiscoveryCacheRepository(),
    );
    const before = Date.now();
    const outcome = await janitor.run(before);
    expect(outcome.deleted).toBe(0);
    expect(outcome.cutoff.getTime()).toBe(before - 30 * 24 * 60 * 60 * 1000);
  });
});
