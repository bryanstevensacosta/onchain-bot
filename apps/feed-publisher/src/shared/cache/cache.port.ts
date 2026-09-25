/**
 * CachePort + InMemoryCacheAdapter (Tramo 2, todo 1).
 *
 * Consumer-side TTL cache (feed reads, LLM responses). Redis-backed
 * adapter lands with the persistence todo; until then the in-memory
 * adapter keeps every consumer green.
 */
export abstract class CachePort {
  public abstract get<T>(key: string): Promise<T | null>;
  public abstract set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  public abstract del(key: string): Promise<void>;
}

interface CacheRow {
  value: unknown;
  expiresAt: number;
}

export class InMemoryCacheAdapter extends CachePort {
  private readonly rows = new Map<string, CacheRow>();

  public async get<T>(key: string): Promise<T | null> {
    const row = this.rows.get(key);
    if (!row || row.expiresAt <= Date.now()) {
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
