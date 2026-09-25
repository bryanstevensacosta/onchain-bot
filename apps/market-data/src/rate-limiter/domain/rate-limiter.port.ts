/**
 * RateLimiterPort (Tramo 3, todo 12, P50 — rate-limiter domain).
 *
 * True sliding-window limiter contract: per-key hit timestamps pruned
 * against the window on every check. v1 is process-local (application
 * services); the Redis-backed window store lands in infrastructure/
 * (GAP-3) without changing consumers.
 */
export abstract class RateLimiterPort {
  public abstract tryAcquire(key: string, limit: number, windowMs: number, now?: number): boolean;
  public abstract resetKey(key: string): void;
  public abstract resetAll(): void;
}
