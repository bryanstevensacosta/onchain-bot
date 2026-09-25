import { Injectable } from '@nestjs/common';

/**
 * RateLimiterService (Tramo 3, todo 2).
 *
 * True sliding-window limiter: per-key hit timestamps, pruned against
 * the window on every check. Pre-call gate for the todo-3 aggregator
 * cascades; edge HTTP policy lives in src/gateway/.
 */
@Injectable()
export class RateLimiterService {
  private readonly hits = new Map<string, number[]>();

  public tryAcquire(key: string, limit: number, windowMs: number, now: number = Date.now()): boolean {
    const at = now;
    const window = this.hits.get(key) ?? [];
    const live = window.filter((timestamp) => at - timestamp < windowMs);
    if (live.length >= limit) {
      this.hits.set(key, live);
      return false;
    }
    live.push(at);
    this.hits.set(key, live);
    return true;
  }

  public resetKey(key: string): void {
    this.hits.delete(key);
  }

  public resetAll(): void {
    this.hits.clear();
  }
}
