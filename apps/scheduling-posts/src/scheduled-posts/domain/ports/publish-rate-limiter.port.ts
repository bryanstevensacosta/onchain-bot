/**
 * Per-session publish limiter (contract §5: 10/min default, 429).
 * Checked BEFORE the idempotency store so a 429 never burns keys.
 */
export abstract class PublishRateLimiter {
  public abstract tryAcquire(sessionId: string): Promise<boolean>;
}
