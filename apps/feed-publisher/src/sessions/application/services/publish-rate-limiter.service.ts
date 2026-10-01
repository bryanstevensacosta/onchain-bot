import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from 'shared/kernel/domain-error';

function envInt(name: string, fallback: number): number {
  const raw = (process.env[name] ?? '').trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Per-session publish rate limiter (Tramo 2, todo 14, P50).
 *
 * Fixed-window budget per session id: `PUBLISH_RATE_LIMIT_PER_MINUTE`
 * publishes per `PUBLISH_RATE_LIMIT_WINDOW_MS` (defaults 10/min).
 * Budgets are per session, so one hot tab never starves its siblings.
 * Over-budget publishes throw RATE_LIMITED (429) BEFORE any Bot API
 * call — the attempt is audited, never sent.
 */
@Injectable()
export class PublishRateLimiter {
  private readonly hits = new Map<
    string,
    { windowStartMs: number; count: number }
  >();

  public constructor(
    private readonly limit: number = envInt(
      'PUBLISH_RATE_LIMIT_PER_MINUTE',
      10,
    ),
    private readonly windowMs: number = envInt(
      'PUBLISH_RATE_LIMIT_WINDOW_MS',
      60_000,
    ),
  ) {}

  public check(sessionId: string, now: Date = new Date()): void {
    const at = now.getTime();
    const state = this.hits.get(sessionId);
    if (!state || at - state.windowStartMs >= this.windowMs) {
      this.hits.set(sessionId, { windowStartMs: at, count: 1 });
      return;
    }
    if (state.count >= this.limit) {
      throw new DomainError(
        ErrorCode.RATE_LIMITED,
        `publish rate exceeded for session ${sessionId} (limit ${this.limit}/window)`,
      );
    }
    state.count += 1;
  }

  public reset(): void {
    this.hits.clear();
  }
}
