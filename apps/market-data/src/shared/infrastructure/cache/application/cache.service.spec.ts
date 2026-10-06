import { InMemoryCacheAdapter } from '../infrastructure/in-memory-cache.adapter';
import { CacheService } from './cache.service';

/**
 * Failing-first spec (Tramo 3, todo 2): cache service (SLO layer).
 */
describe('CacheService', () => {
  it('returns null on a miss', async () => {
    const service = new CacheService(new InMemoryCacheAdapter());
    await expect(service.get('missing')).resolves.toBeNull();
  });

  it('round-trips a value within TTL', async () => {
    const service = new CacheService(new InMemoryCacheAdapter());
    await service.set('k', { a: 1 }, 60);
    await expect(service.get('k')).resolves.toEqual({ a: 1 });
  });

  it('getOrSet loads once then serves cached', async () => {
    const service = new CacheService(new InMemoryCacheAdapter());
    let calls = 0;
    const loader = async (): Promise<string> => {
      calls += 1;
      return 'v';
    };
    await expect(service.getOrSet('k', 60, loader)).resolves.toBe('v');
    await expect(service.getOrSet('k', 60, loader)).resolves.toBe('v');
    expect(calls).toBe(1);
  });

  it('expires entries past TTL', async () => {
    const service = new CacheService(new InMemoryCacheAdapter());
    await service.set('k', 'v', -1);
    await expect(service.get('k')).resolves.toBeNull();
  });

  it('getOrSet skips the write when shouldCache rejects (pending shells)', async () => {
    const service = new CacheService(new InMemoryCacheAdapter());
    let calls = 0;
    const loader = async (): Promise<{ status: string }> => {
      calls += 1;
      return { status: 'pending' };
    };
    const gate = (value: { status: string }): boolean =>
      value.status !== 'pending';
    await expect(service.getOrSet('k', 60, loader, gate)).resolves.toEqual({
      status: 'pending',
    });
    await expect(service.getOrSet('k', 60, loader, gate)).resolves.toEqual({
      status: 'pending',
    });
    expect(calls).toBe(2);
  });

  it('getOrSet writes when shouldCache accepts (ready snapshots)', async () => {
    const service = new CacheService(new InMemoryCacheAdapter());
    let calls = 0;
    const loader = async (): Promise<{ status: string }> => {
      calls += 1;
      return { status: 'ready' };
    };
    const gate = (value: { status: string }): boolean =>
      value.status !== 'pending';
    await service.getOrSet('k', 60, loader, gate);
    await service.getOrSet('k', 60, loader, gate);
    expect(calls).toBe(1);
  });
});
