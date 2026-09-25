import { Injectable } from '@nestjs/common';
import { CachePort } from './cache.port';

interface CacheRow {
  readonly value: unknown;
  readonly expiresAt: number;
}

/**
 * InMemoryCacheAdapter (Tramo 3, todo 2).
 *
 * TTL map with lazy expiry on read. Keeps every consumer green until
 * the Redis-backed adapter lands (same port, REDIS_URL).
 */
@Injectable()
export class InMemoryCacheAdapter extends CachePort {
  private readonly rows = new Map<string, CacheRow>();

  public async get<T>(key: string): Promise<T | null> {
    const row = this.rows.get(key);
    if (row === undefined || row.expiresAt <= Date.now()) {
      this.rows.delete(key);
      return null;
    }
    return row.value as T;
  }

  public async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.rows.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  public async del(key: string): Promise<void> {
    this.rows.delete(key);
  }
}
