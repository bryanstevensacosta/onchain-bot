import { Injectable } from '@nestjs/common';

export interface BotSendStats {
  readonly sent: number;
  readonly quotaWaits: number;
  readonly quotaWaitMs: number;
  readonly telegram429: number;
  readonly retried: number;
  readonly failed: number;
}

const ZERO: BotSendStats = {
  sent: 0,
  quotaWaits: 0,
  quotaWaitMs: 0,
  telegram429: 0,
  retried: 0,
  failed: 0,
};

/** Per-bot send accounting (todo 2): quota pacing + 429 backoff counters. */
@Injectable()
export class SendAccountingService {
  private readonly stats = new Map<string, BotSendStats>();

  public markSent(botId: string): void {
    this.update(botId, { sent: 1 });
  }

  public markQuotaWait(botId: string, waitedMs: number): void {
    this.update(botId, { quotaWaits: 1, quotaWaitMs: Math.round(waitedMs) });
  }

  public mark429(botId: string): void {
    this.update(botId, { telegram429: 1 });
  }

  public markRetry(botId: string): void {
    this.update(botId, { retried: 1 });
  }

  public markFailed(botId: string): void {
    this.update(botId, { failed: 1 });
  }

  public snapshot(botId: string): BotSendStats {
    return this.stats.get(botId) ?? { ...ZERO };
  }

  public reset(botId?: string): void {
    if (botId) this.stats.delete(botId);
    else this.stats.clear();
  }

  private update(botId: string, delta: Partial<BotSendStats>): void {
    const cur = this.stats.get(botId) ?? { ...ZERO };
    this.stats.set(botId, {
      sent: cur.sent + (delta.sent ?? 0),
      quotaWaits: cur.quotaWaits + (delta.quotaWaits ?? 0),
      quotaWaitMs: cur.quotaWaitMs + (delta.quotaWaitMs ?? 0),
      telegram429: cur.telegram429 + (delta.telegram429 ?? 0),
      retried: cur.retried + (delta.retried ?? 0),
      failed: cur.failed + (delta.failed ?? 0),
    });
  }
}
