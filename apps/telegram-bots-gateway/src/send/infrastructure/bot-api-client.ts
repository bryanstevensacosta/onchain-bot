import { Inject, Injectable, Optional } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../shared/kernel/domain-error';
import { SendAccountingService } from '../application/send-accounting.service';

export type BotFetchFn = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

interface BotApiEnvelope {
  ok: boolean;
  result?: unknown;
  description?: string;
  error_code?: number;
  retry_after?: number;
  parameters?: { retry_after?: number };
}

/**
 * Centralized Bot API transport (todo 2): honors Telegram 429
 * `retry_after`, retries bounded times, then fails closed (FAILED,
 * no infinite retry). Tokens never appear in errors or logs.
 */
@Injectable()
export class BotApiClient {
  public constructor(
    @Optional() @Inject('FETCH_FN') private readonly fetchFn?: BotFetchFn,
    @Optional()
    @Inject('TELEGRAM_API_BASE')
    private readonly apiBase?: string,
    @Optional() private readonly accounting?: SendAccountingService,
    @Optional()
    @Inject('SEND_OPTIONS')
    private readonly options?: { maxRetries?: number },
  ) {}

  public async post(
    botId: string,
    token: string,
    method: string,
    payload: Record<string, unknown>,
  ): Promise<{ result: unknown; attempts: number }> {
    const base = this.apiBase ?? 'https://api.telegram.org';
    const maxRetries = this.options?.maxRetries ?? 3;
    let attempts = 0;
    for (;;) {
      attempts += 1;
      const res = await this.fetchWithTimeout(
        `${base}/bot${token}/${method}`,
        payload,
      );
      const body = (await res.json()) as BotApiEnvelope;
      if (BotApiClient.isRateLimited(res.status, body)) {
        this.accounting?.mark429(botId);
        if (attempts > maxRetries) {
          this.accounting?.markFailed(botId);
          throw new DomainError(
            ErrorCode.UPSTREAM,
            `Telegram 429 persisted after ${attempts} attempts (${method})`,
          );
        }
        this.accounting?.markRetry(botId);
        await BotApiClient.sleep(BotApiClient.retryAfterMs(body));
        continue;
      }
      if (!res.ok || !body.ok || body.result === undefined) {
        this.accounting?.markFailed(botId);
        throw new DomainError(
          ErrorCode.UPSTREAM,
          `Bot API ${method} failed${body.description ? `: ${body.description}` : ''}`,
        );
      }
      return { result: body.result, attempts };
    }
  }

  private static isRateLimited(status: number, body: BotApiEnvelope): boolean {
    return status === 429 || body.error_code === 429;
  }

  private static retryAfterMs(body: BotApiEnvelope): number {
    const sec = body.parameters?.retry_after ?? body.retry_after ?? 1;
    return Math.min(Math.max(0, sec) * 1000, 60_000);
  }

  private async fetchWithTimeout(url: string, payload: Record<string, unknown>) {
    const fetchFn: BotFetchFn =
      this.fetchFn ?? (globalThis.fetch as unknown as BotFetchFn);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      return await fetchFn(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
