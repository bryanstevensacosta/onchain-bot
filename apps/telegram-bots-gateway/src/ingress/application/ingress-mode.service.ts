import { Injectable } from '@nestjs/common';
import { DomainError, ErrorCode } from '../../shared/kernel/domain-error';
import type { IngressMode } from '../domain/ingress-route';
import { SubscriptionRegistryService } from './subscription-registry.service';

/**
 * Exclusive ingress mode per bot (todo 3): Telegram delivers a bot's
 * updates via webhook XOR getUpdates — never both. Enabling one mode
 * disables the other by construction (single `mode` field, no second
 * flag to drift). The poller refuses to start while webhook is active
 * and the webhook receptor refuses delivery while polling is active.
 */
@Injectable()
export class IngressModeService {
  public constructor(private readonly registry: SubscriptionRegistryService) {}

  public getMode(botId: string): IngressMode {
    const route = this.registry.get(botId);
    if (!route) {
      throw new DomainError(ErrorCode.NOT_FOUND, `bot ${botId} not found`, {
        botId,
      });
    }
    return route.mode;
  }

  public enableWebhook(botId: string): IngressMode {
    return this.registry.setMode(botId, 'webhook').mode;
  }

  public enablePolling(botId: string): IngressMode {
    return this.registry.setMode(botId, 'polling').mode;
  }

  /** Throws CONFLICT (→ 409) when polling owns the bot. */
  public assertWebhookActive(botId: string): void {
    if (this.getMode(botId) !== 'webhook') {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `bot ${botId} is in polling mode: webhook and getUpdates are mutually exclusive`,
        { botId },
      );
    }
  }

  /** Throws CONFLICT (→ 409) when webhook owns the bot. */
  public assertPollingActive(botId: string): void {
    if (this.getMode(botId) !== 'polling') {
      throw new DomainError(
        ErrorCode.CONFLICT,
        `bot ${botId} is in webhook mode: getUpdates and webhook are mutually exclusive`,
        { botId },
      );
    }
  }
}
