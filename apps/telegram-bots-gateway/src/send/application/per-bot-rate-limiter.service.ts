import { Inject, Injectable, Optional } from '@nestjs/common';

export interface RateLimitOpts {
  readonly botPerSecond?: number;
  readonly perChatPerSecond?: number;
}

const WINDOW_MS = 1000;

/**
 * Global per-bot send pacing (todo 2): Telegram allows ~30 msg/s per
 * bot across all chats and ~1 msg/s per chat. Enforcement is a
 * sliding-window gate with per-bot promise-chain queues, so concurrent
 * sends from N apps serialize per bot and wait for the next window
 * instead of bursting past the quota.
 *
 * This is Telegram-quota pacing, NOT product policy: delays/caps stay
 * in the calling apps (plan constraint).
 */
@Injectable()
export class PerBotRateLimiterService {
  private readonly botStamps = new Map<string, number[]>();
  private readonly chatStamps = new Map<string, number[]>();
  private readonly tails = new Map<string, Promise<void>>();
  private readonly botPerSecond: number;
  private readonly perChatPerSecond: number;

  public constructor(
    @Optional()
    @Inject('RATE_LIMIT_OPTS')
    opts?: RateLimitOpts,
  ) {
    this.botPerSecond = opts?.botPerSecond ?? 30;
    this.perChatPerSecond = opts?.perChatPerSecond ?? 1;
  }

  /** Acquires a send slot, waiting for quota when needed. Resolves with the time waited. */
  public async acquire(botId: string, chatId: string): Promise<{ waitedMs: number }> {
    const prev = this.tails.get(botId) ?? Promise.resolve();
    let release!: () => void;
    const cur = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.tails.set(botId, prev.then(() => cur));
    await prev;
    const startedAt = Date.now();
    try {
      for (let i = 0; i < 25; i += 1) {
        const waitMs = this.computeWaitMs(botId, chatId, Date.now());
        if (waitMs <= 0) break;
        await PerBotRateLimiterService.sleep(waitMs);
      }
      this.record(botId, chatId, Date.now());
      return { waitedMs: Date.now() - startedAt };
    } finally {
      release();
    }
  }

  public reset(): void {
    this.botStamps.clear();
    this.chatStamps.clear();
    this.tails.clear();
  }

  private computeWaitMs(botId: string, chatId: string, now: number): number {
    const bot = this.prune(`bot:${botId}`, this.botStamps, now);
    const chat = this.prune(`chat:${botId}:${chatId}`, this.chatStamps, now);
    let wait = 0;
    if (bot.length >= this.botPerSecond) {
      wait = Math.max(wait, bot[0] + WINDOW_MS - now);
    }
    if (chat.length >= this.perChatPerSecond) {
      wait = Math.max(wait, chat[0] + WINDOW_MS - now);
    }
    return Math.max(0, wait);
  }

  private prune(key: string, rows: Map<string, number[]>, now: number): number[] {
    const kept = (rows.get(key) ?? []).filter((t) => t > now - WINDOW_MS);
    rows.set(key, kept);
    return kept;
  }

  private record(botId: string, chatId: string, now: number): void {
    this.botStamps.get(`bot:${botId}`)?.push(now) ??
      this.botStamps.set(`bot:${botId}`, [now]);
    const chatKey = `chat:${botId}:${chatId}`;
    this.chatStamps.get(chatKey)?.push(now) ??
      this.chatStamps.set(chatKey, [now]);
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
