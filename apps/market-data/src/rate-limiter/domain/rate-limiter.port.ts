/**
 * RateLimiterPort (Tramo 3, todo 12, P50 — rate-limiter domain;
 * widened todo 14 for the Redis token-bucket).
 *
 * True sliding-window limiter contract: per-key hit timestamps pruned
 * against the window on every check. v1 is process-local (application
 * services); the Redis-backed window store lands in infrastructure/
 * (GAP-3) without changing consumers.
 *
 * `tryAcquire` may resolve synchronously (in-memory windows) or
 * asynchronously (Redis token-bucket) — consumers MUST await it.
 * Deny means "skip this outbound call with an explicit error",
 * never "fail the snapshot" (fail-open at the snapshot level);
 * infra outages fail open too (allow the call).
 */
export abstract class RateLimiterPort {
  public abstract tryAcquire(key: string, limit: number, windowMs: number, now?: number): boolean | Promise<boolean>;
  public abstract resetKey(key: string): void;
  public abstract resetAll(): void;
}
