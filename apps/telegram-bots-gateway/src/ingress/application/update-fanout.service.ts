import { Inject, Injectable, Optional } from '@nestjs/common';
import { createHmac } from 'crypto';
import { DomainError, ErrorCode } from '../../shared/kernel/domain-error';
import { SubscriptionRegistryService } from './subscription-registry.service';
import { DeadLetterStore } from './dead-letter.store';

export type IngressFetchFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; status: number }>;

export type SleepFn = (ms: number) => Promise<void>;

export interface FanoutFailure {
  readonly appId: string;
  readonly error: string;
}

export interface FanoutResult {
  readonly delivered: string[];
  readonly failed: FanoutFailure[];
  readonly attempts: Record<string, number>;
}

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BACKOFF_MS = [200, 1000, 5000];

/**
 * Pass-through update fan-out (todo 3): POSTs the raw Telegram update
 * body, byte-identical, to every subscribed app. No parsing, no
 * filtering, no business logic — delivery + per-subscriber auth only.
 * Down apps get bounded retries with backoff, then a dead-letter
 * record (operator replay lands with todo 7 persistence).
 */
@Injectable()
export class UpdateFanoutService {
  private readonly maxAttempts: number;
  private readonly backoffMs: number[];

  public constructor(
    private readonly registry: SubscriptionRegistryService,
    private readonly deadLetters: DeadLetterStore,
    @Optional() @Inject('INGRESS_FETCH_FN') fetchFn?: IngressFetchFn,
    @Optional() @Inject('INGRESS_SLEEP_FN') private readonly sleep?: SleepFn,
    @Optional()
    @Inject('INGRESS_FANOUT_OPTS')
    opts?: { maxAttempts?: number; backoffMs?: number[] },
  ) {
    this.fetchFn =
      fetchFn ??
      (async (url, init) => {
        const res = await fetch(url, {
          method: init.method,
          headers: init.headers,
          body: init.body,
        });
        return { ok: res.ok, status: res.status };
      });
    this.maxAttempts = Math.max(1, opts?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    this.backoffMs = opts?.backoffMs ?? DEFAULT_BACKOFF_MS;
  }

  private readonly fetchFn: IngressFetchFn;

  public async fanout(botId: string, update: unknown): Promise<FanoutResult> {
    const route = this.registry.get(botId);
    if (!route) {
      throw new DomainError(ErrorCode.NOT_FOUND, `bot ${botId} not found`, {
        botId,
      });
    }
    const raw = JSON.stringify(update ?? {});
    const delivered: string[] = [];
    const failed: FanoutFailure[] = [];
    const attempts: Record<string, number> = {};
    for (const sub of route.subscribers) {
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-gateway-bot': botId,
      };
      if (sub.secret) {
        headers['x-gateway-signature'] = createHmac('sha256', sub.secret)
          .update(raw)
          .digest('hex');
      }
      let lastError = 'unknown error';
      let attempt = 0;
      for (attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
        try {
          const res = await this.fetchFn(sub.url, {
            method: 'POST',
            headers,
            body: raw,
          });
          if (res.ok) {
            delivered.push(sub.appId);
            break;
          }
          lastError = `subscriber answered ${res.status}`;
        } catch (err) {
          lastError = (err as Error).message || 'fetch failed';
        }
        if (attempt < this.maxAttempts) {
          await this.sleepFor(this.backoffMs[attempt - 1] ?? 5000);
        }
      }
      attempts[sub.appId] =
        attempt > this.maxAttempts ? this.maxAttempts : attempt;
      if (!delivered.includes(sub.appId)) {
        failed.push({ appId: sub.appId, error: lastError });
        this.deadLetters.append({
          botId,
          appId: sub.appId,
          updateId: readUpdateId(update),
          payload: update,
          attempts: this.maxAttempts,
          lastError,
          at: new Date().toISOString(),
        });
      }
    }
    return { delivered, failed, attempts };
  }

  private async sleepFor(ms: number): Promise<void> {
    if (this.sleep) return this.sleep(ms);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function readUpdateId(update: unknown): number | null {
  if (typeof update === 'object' && update !== null) {
    const id = (update as { update_id?: unknown }).update_id;
    if (typeof id === 'number') return id;
  }
  return null;
}
