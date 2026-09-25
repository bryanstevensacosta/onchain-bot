import { Injectable } from '@nestjs/common';

/** Shared fallback when no usable per-bot limit is configured. */
export const DEFAULT_TELEGRAM_RATE_LIMIT_PER_MINUTE = 20;

const WINDOW_MS = 60_000;

/**
 * Resolve the effective per-minute budget for one bot: the per-bot
 * override wins when it is a finite number >= 1, otherwise the shared
 * `TELEGRAM_RATE_LIMIT_PER_MINUTE` value, otherwise the 20/min default.
 */
export function resolveRateLimit(
  perBotRaw: string | undefined,
  sharedRaw: string | undefined,
): number {
  for (const raw of [perBotRaw, sharedRaw]) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.floor(parsed);
    }
  }
  return DEFAULT_TELEGRAM_RATE_LIMIT_PER_MINUTE;
}

/**
 * In-memory rolling-window rate limiter — ONE instance per bot.
 *
 * Each Bot API adapter owns its instance, so the crypto and threads
 * bots pace independently (per-bot rate-limit config, todo 7). The
 * window is a fixed 60s bucket (not sliding): simple, deterministic,
 * and exact enough for a 1 msg/min-class publisher cadence.
 */
@Injectable()
export class TelegramRateLimiter {
  private windowStartMs = 0;
  private used = 0;

  public constructor(private readonly maxPerMinute: number) {
    if (!Number.isFinite(maxPerMinute) || maxPerMinute < 1) {
      this.maxPerMinute = DEFAULT_TELEGRAM_RATE_LIMIT_PER_MINUTE;
    }
  }

  public get limit(): number {
    return this.maxPerMinute;
  }

  public tryAcquire(now: Date = new Date()): boolean {
    const at = now.getTime();
    if (this.windowStartMs === 0 || at - this.windowStartMs >= WINDOW_MS) {
      this.windowStartMs = at;
      this.used = 0;
    }
    if (this.used >= this.maxPerMinute) {
      return false;
    }
    this.used += 1;
    return true;
  }
}
