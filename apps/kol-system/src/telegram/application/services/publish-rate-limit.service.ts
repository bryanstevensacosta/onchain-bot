import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../../shared/kernel/domain-error';

const WINDOW_MS = 60_000;

/**
 * Fixed-window publish rate limiter (Tramo 1, todo 23, P50).
 *
 * Caps publish attempts per caller+scope key (default 30/min, override via
 * `PUBLISH_RATE_LIMIT_PER_MIN`). Over-limit attempts throw RATE_LIMITED
 * (429) BEFORE any Telegram call. In-memory today; Redis counters land with
 * the persistence todo.
 */
@Injectable()
export class PublishRateLimitService {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private overrideLimit: number | null = null;

  public setLimitForTests(limitPerMin: number): void {
    this.overrideLimit = limitPerMin;
  }

  public checkOrThrow(key: string, now: number = Date.now()): void {
    const limit = this.limit();
    const slot = this.hits.get(key);
    if (!slot || now >= slot.resetAt) {
      this.hits.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return;
    }
    slot.count += 1;
    if (slot.count > limit) {
      throw new DomainError(
        ErrorCode.RATE_LIMITED,
        'publish rate limit exceeded',
        {
          key,
          limitPerMin: limit,
        },
      );
    }
  }

  public clear(): void {
    this.hits.clear();
  }

  private limit(): number {
    if (this.overrideLimit !== null) return this.overrideLimit;
    const fromEnv = Number(process.env.PUBLISH_RATE_LIMIT_PER_MIN ?? '');
    return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : 30;
  }
}
