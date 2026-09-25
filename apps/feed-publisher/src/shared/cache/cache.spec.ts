import { CachePort, InMemoryCacheAdapter } from './cache.port';

describe('InMemoryCacheAdapter', () => {
  it('stores, reads and deletes', async () => {
    const cache: CachePort = new InMemoryCacheAdapter();
    await cache.set('k', 'v', 60);
    expect(await cache.get('k')).toBe('v');
    await cache.del('k');
    expect(await cache.get('k')).toBeNull();
  });

  it('misses on unknown keys', async () => {
    const cache = new InMemoryCacheAdapter();
    expect(await cache.get('missing')).toBeNull();
  });
});
