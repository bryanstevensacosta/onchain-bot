/**
 * Sliding-window per-key rate limiter (ai-ml, todo 0).
 *
 * Pure in-memory: each budget key gets its own window of timestamps;
 * over-budget attempts are rejected (the guard turns them into 429 +
 * audit) and never reach the provider. Framework-free so it is unit
 * testable without Nest.
 */
export class ApiKeyRateLimiter {
  private readonly hits = new Map<string, number[]>();

  public constructor(
    private readonly defaultLimitPerMin = 60,
    private readonly windowMs = 60_000,
  ) {}

  public consume(key: string, limitPerMin?: number, now = Date.now()): boolean {
    const limit = limitPerMin ?? this.defaultLimitPerMin;
    const cutoff = now - this.windowMs;
    const bucket = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (bucket.length >= limit) {
      this.hits.set(key, bucket);
      return false;
    }
    bucket.push(now);
    this.hits.set(key, bucket);
    return true;
  }

  public reset(key: string): void {
    this.hits.delete(key);
  }
}
