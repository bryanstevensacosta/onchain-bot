import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublishRateLimiter } from '../../domain/ports/publish-rate-limiter.port';

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window per-session limiter (default 10/min, contract §5).
 * Window state is memory-only; a restart resets budgets (fail-open).
 */
@Injectable()
export class InMemoryPublishRateLimiter extends PublishRateLimiter {
  private readonly windows = new Map<string, Window>();
  private readonly perMin: number;

  public constructor(@Optional() config?: ConfigService) {
    super();
    const fromEnv = parseInt(
      config?.get<string>('PUBLISH_RATE_LIMIT_PER_MIN', '') ?? '',
      10,
    );
    this.perMin = Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 10;
  }

  public async tryAcquire(sessionId: string): Promise<boolean> {
    const now = Date.now();
    const current = this.windows.get(sessionId);
    if (!current || current.resetAt <= now) {
      this.windows.set(sessionId, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    if (current.count >= this.perMin) {
      return false;
    }
    current.count += 1;
    return true;
  }
}
