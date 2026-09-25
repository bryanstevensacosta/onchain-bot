import { Inject, Injectable } from '@nestjs/common';
import { CachePort } from './cache.port';

/**
 * CacheService (Tramo 3, todo 2, SLO layer).
 *
 * Thin convenience over CachePort: passthrough get/set/del plus
 * getOrSet (single loader call per TTL window).
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

  public async getOrSet<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
    const cached = await this.port.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    const fresh = await loader();
    await this.port.set(key, fresh, ttlSeconds);
    return fresh;
  }
}
