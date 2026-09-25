import { Injectable } from '@nestjs/common';

/**
 * Per-key sliding-window limiter (Tramo 3, todo 10, P46).
 *
 * Keyed by API-key id (never by key material). Each key enforces its
 * own `rateLimitPerMin`; unknown callers fall back to the edge budget.
 */
@Injectable()
export class ApiKeyRateLimiter {
  private readonly hits = new Map<string, number[]>();

  public tryAcquire(keyId: string, limitPerMin: number, now: number = Date.now()): boolean {
    const live = (this.hits.get(keyId) ?? []).filter((t) => now - t < 60_000);
    if (live.length >= limitPerMin) {
      this.hits.set(keyId, live);
      return false;
    }
    live.push(now);
    this.hits.set(keyId, live);
    return true;
  }

  public resetKey(keyId: string): void {
    this.hits.delete(keyId);
  }

  public resetAll(): void {
    this.hits.clear();
  }
}
