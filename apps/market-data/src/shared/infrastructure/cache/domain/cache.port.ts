/**
 * CachePort (Tramo 3, todo 2, SLO layer).
 *
 * Consumer-side TTL cache. v1 is in-memory; a Redis-backed adapter
 * (REDIS_URL) swaps in without changing consumers.
 */
export abstract class CachePort {
  public abstract get<T>(key: string): Promise<T | null>;
  public abstract set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  public abstract del(key: string): Promise<void>;
}
