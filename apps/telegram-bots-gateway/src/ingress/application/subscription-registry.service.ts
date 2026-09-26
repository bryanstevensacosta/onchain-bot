import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../shared/kernel/domain-error';
import type {
  MutableIngressRoute,
  UpdateSubscriber,
} from '../domain/ingress-route';

/**
 * In-memory subscription registry (todo 3): one ingress route per bot.
 *
 * A route carries the per-route webhook secret (Telegram
 * `secret_token`), the exclusive ingress mode (webhook XOR polling),
 * and the list of subscribed apps (kol-system, feed-publisher, dexter)
 * that receive pass-through fan-out. No business logic lives here —
 * only routing data. A persistent store lands with multi-replica
 * deploy (same todo 7 track as quota + idempotency).
 */
@Injectable()
export class SubscriptionRegistryService {
  private readonly routes = new Map<string, MutableIngressRoute>();

  public constructor() {
    this.loadFromEnv(process.env.BOTS_GATEWAY_INGRESS);
  }

  public registerBot(
    botId: string,
    webhookSecret: string,
  ): MutableIngressRoute {
    const id = mustId(botId);
    const secret = mustSecret(webhookSecret);
    const existing = this.routes.get(id);
    if (existing) {
      existing.webhookSecret = secret;
      return this.snapshot(existing);
    }
    const route: MutableIngressRoute = {
      botId: id,
      webhookSecret: secret,
      mode: 'webhook',
      subscribers: [],
    };
    this.routes.set(id, route);
    return this.snapshot(route);
  }

  public setWebhookSecret(
    botId: string,
    webhookSecret: string,
  ): MutableIngressRoute {
    const route = this.require(mustId(botId));
    route.webhookSecret = mustSecret(webhookSecret);
    return this.snapshot(route);
  }

  public subscribe(
    botId: string,
    subscriber: UpdateSubscriber,
  ): MutableIngressRoute {
    const route = this.require(mustId(botId));
    const appId = mustId(subscriber.appId);
    const url = mustUrl(subscriber.url);
    const idx = route.subscribers.findIndex((s) => s.appId === appId);
    const next: UpdateSubscriber = subscriber.secret
      ? { appId, url, secret: subscriber.secret }
      : { appId, url };
    if (idx >= 0) route.subscribers[idx] = next;
    else route.subscribers.push(next);
    return this.snapshot(route);
  }

  public unsubscribe(botId: string, appId: string): MutableIngressRoute {
    const route = this.require(mustId(botId));
    route.subscribers = route.subscribers.filter((s) => s.appId !== appId);
    return this.snapshot(route);
  }

  public setMode(
    botId: string,
    mode: 'webhook' | 'polling',
  ): MutableIngressRoute {
    const route = this.require(mustId(botId));
    route.mode = mode;
    return this.snapshot(route);
  }

  public get(botId: string): MutableIngressRoute | undefined {
    const route = this.routes.get(mustId(botId, false));
    return route ? this.snapshot(route) : undefined;
  }

  public list(): MutableIngressRoute[] {
    return [...this.routes.values()].map((r) => this.snapshot(r));
  }

  public clear(): void {
    this.routes.clear();
  }

  /** Mutable handle for mode/poller internals (same process, no copies). */
  public requireRef(botId: string): MutableIngressRoute {
    return this.require(mustId(botId));
  }

  private require(botId: string): MutableIngressRoute {
    const route = this.routes.get(botId);
    if (!route) {
      throw new DomainError(ErrorCode.NOT_FOUND, `bot ${botId} not found`, {
        botId,
      });
    }
    return route;
  }

  private snapshot(route: MutableIngressRoute): MutableIngressRoute {
    return {
      botId: route.botId,
      webhookSecret: route.webhookSecret,
      mode: route.mode,
      subscribers: route.subscribers.map((s) => ({ ...s })),
    };
  }

  private loadFromEnv(raw: string | undefined): void {
    if (!raw || !raw.trim()) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'BOTS_GATEWAY_INGRESS is not valid JSON',
      );
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new DomainError(
        ErrorCode.VALIDATION,
        'BOTS_GATEWAY_INGRESS must be a JSON object keyed by bot id',
      );
    }
    for (const [botId, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      const entry = value as {
        webhookSecret?: unknown;
        mode?: unknown;
        subscribers?: unknown;
      };
      if (typeof entry?.webhookSecret !== 'string' || !entry.webhookSecret) {
        throw new DomainError(
          ErrorCode.VALIDATION,
          `BOTS_GATEWAY_INGRESS[${botId}].webhookSecret must not be empty`,
        );
      }
      this.registerBot(botId, entry.webhookSecret);
      if (entry.mode === 'polling') this.setMode(botId, 'polling');
      if (Array.isArray(entry.subscribers)) {
        for (const sub of entry.subscribers as Array<{
          appId?: unknown;
          url?: unknown;
          secret?: unknown;
        }>) {
          this.subscribe(botId, {
            appId: String(sub.appId ?? ''),
            url: String(sub.url ?? ''),
            secret:
              typeof sub.secret === 'string' && sub.secret
                ? sub.secret
                : undefined,
          });
        }
      }
    }
  }
}

function mustId(value: string, strict = true): string {
  const id = (value ?? '').trim();
  if (!id && strict) {
    throw new DomainError(ErrorCode.VALIDATION, 'bot id must not be empty');
  }
  return id;
}

function mustSecret(value: string): string {
  if (!value || value.length < 8) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      'webhook secret must be at least 8 characters',
    );
  }
  return value;
}

function mustUrl(value: string): string {
  const url = (value ?? '').trim();
  if (!/^https?:\/\/.+/.test(url)) {
    throw new DomainError(
      ErrorCode.VALIDATION,
      `subscriber url must be http(s): ${value}`,
    );
  }
  return url;
}
