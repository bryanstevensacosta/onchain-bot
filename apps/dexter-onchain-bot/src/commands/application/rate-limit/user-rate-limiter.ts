/**
 * Per-user rate limiter (Tramo 3, todo 9, P13 — NEW).
 *
 * Sliding-window budget per Telegram user id: `limit` commands per
 * 60 s. Over-budget messages are dropped (the caller sends the warning).
 * Lookup-only guard: it never publishes, it only drops inbound load.
 */
export class UserRateLimiter {
  private readonly hits = new Map<
    string,
    { count: number; windowStart: number }
  >();

  public constructor(
    private readonly limitPerMinute: number,
    private readonly windowMs = 60_000,
  ) {}

  public isAllowed(userId: number | string): boolean {
    const key = String(userId);
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: now });
      return true;
    }
    if (entry.count >= this.limitPerMinute) return false;
    entry.count += 1;
    return true;
  }

  public reset(userId: number | string): void {
    this.hits.delete(String(userId));
  }
}
