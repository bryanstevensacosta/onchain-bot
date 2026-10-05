import { Inject, Injectable } from '@nestjs/common';
import { CachePort } from '../domain/cache.port';

/**
 * CacheService (Tramo 3, todo 2; hexagonal home todo 12, P50).
 *
 * Thin convenience over CachePort: passthrough get/set/del plus
 * getOrSet (single loader call per TTL window).
 *
 * Robust-nulls (plan todo 19a): `getOrSet` takes an optional
 * `shouldCache` gate — the batch edge passes "not pending" so
 * transient snapshots are recomputed on the next MISS instead of
 * being served as hits. The default (`() => true`) preserves the
 * historical always-write behavior for every other caller.
 */
@Injectable()
export class CacheService {
  public constructor(@Inject(CachePort) private readonly port: CachePort) {}

  public get<T>(key: string): Promise<T | null> {
    return this.port.get<T>(key);
  }

  public set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    return this.port.set(key, value, ttlSeconds);
  }

  public del(key: string): Promise<void> {
    return this.port.del(key);
  }

  public async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
    shouldCache: (value: T) => boolean = () => true,
  ): Promise<T> {
    const cached = await this.port.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    const fresh = await loader();
    if (shouldCache(fresh)) {
      await this.port.set(key, fresh, ttlSeconds);
    }
    return fresh;
  }
}
