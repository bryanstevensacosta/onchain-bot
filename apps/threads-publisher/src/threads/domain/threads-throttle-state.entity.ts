/**
 * Per-target throttle state (60s-300s bounds, backend parity).
 */
export class ThreadsThrottleState {
  public lastPublishedAt: Date | null = null;
  public dayKey: string | null = null;
  public publishedToday = 0;

  public static dayKeyOf(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  public canPublish(now: Date, dailyCap: number, minDelayMs: number): boolean {
    const key = ThreadsThrottleState.dayKeyOf(now);
    const count = this.dayKey === key ? this.publishedToday : 0;
    if (count >= dailyCap) {
      return false;
    }
    if (this.lastPublishedAt) {
      return now.getTime() - this.lastPublishedAt.getTime() >= minDelayMs;
    }
    return true;
  }

  public recordPublish(now: Date): void {
    const key = ThreadsThrottleState.dayKeyOf(now);
    if (this.dayKey !== key) {
      this.dayKey = key;
      this.publishedToday = 0;
    }
    this.dayKey = key;
    this.publishedToday += 1;
    this.lastPublishedAt = now;
  }
}
