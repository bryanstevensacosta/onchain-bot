import { Injectable, Optional } from '@nestjs/common';
import type { PublishTarget } from '@/gateway/domain/target-binding';
import {
  TargetDispatcherPort,
  type TargetDispatchInput,
  type TargetDispatchResult,
} from '../ports/target-dispatcher.port';
import { BotsGatewaySenderPort } from '@/gateway/domain/ports/bots-gateway-sender.port';
import { GatewayBotMappingService } from '@/gateway/infrastructure/gateway/gateway-bot-mapping.service';
import { ThreadsPublisherHttpClient } from '@/gateway/infrastructure/threads/threads-publisher-http-client';

export interface TargetDispatcherLimits {
  readonly publishDelayMs: number;
  readonly dailyCap: number;
}

interface PacingState {
  lastSentAtMs: number;
  dayKey: string;
  count: number;
}

function utcDayKey(at: Date): string {
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  const day = String(at.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Unified target dispatcher (threads-publisher plan Fase 2 todo 10,
 * P38-bis per-binding config).
 *
 * Replaces the direct `src/telegram/` + `src/threads/` call sites:
 * `telegram` bindings send via the telegram-bots-gateway (vault id
 * only, resolved through `GatewayBotMappingService` so pre-migration
 * catalog ids keep working); `threads` bindings enqueue into
 * `apps/threads-publisher` over HTTP. Unknown targets throw
 * fail-closed. Per-binding pacing (P38) holds the send when the
 * binding delay/cap is not met — held sends return
 * `{ ok: false, held: true }` (retry later, never dropped, never
 * burned).
 */
@Injectable()
export class TargetDispatcherService extends TargetDispatcherPort {
  private readonly pacing = new Map<string, PacingState>();

  public constructor(
    @Optional() private readonly gateway?: BotsGatewaySenderPort,
    @Optional() private readonly mapping?: GatewayBotMappingService,
    @Optional() private readonly threads?: ThreadsPublisherHttpClient,
  ) {
    super();
  }

  public async dispatch(
    input: TargetDispatchInput,
  ): Promise<TargetDispatchResult> {
    if (!input.content) {
      return { ok: false, error: 'empty content', held: false };
    }
    if (input.target === 'telegram') {
      return this.dispatchTelegram(input);
    }
    if (input.target === 'threads') {
      return this.dispatchThreads(input);
    }
    throw new Error(`unsupported target: ${String(input.target)}`);
  }

  /** Per-binding pacing gate (P38): delay + daily cap per link. */
  public pacingAllows(
    binding: { botId: string; target: PublishTarget },
    limits: TargetDispatcherLimits | null,
    now: Date = new Date(),
  ): boolean {
    if (!limits) return true;
    if (limits.dailyCap <= 0) return false;
    const key = `${binding.target}:${binding.botId}`;
    const state = this.pacing.get(key);
    if (!state) return true;
    if (state.dayKey !== utcDayKey(now)) return true;
    if (state.count >= limits.dailyCap) return false;
    return now.getTime() - state.lastSentAtMs >= limits.publishDelayMs;
  }

  public markSent(
    binding: { botId: string; target: PublishTarget },
    now: Date = new Date(),
  ): void {
    const key = `${binding.target}:${binding.botId}`;
    const dayKey = utcDayKey(now);
    const previous = this.pacing.get(key);
    this.pacing.set(key, {
      lastSentAtMs: now.getTime(),
      dayKey,
      count:
        previous !== undefined && previous.dayKey === dayKey
          ? previous.count + 1
          : 1,
    });
  }

  private async dispatchTelegram(
    input: TargetDispatchInput,
  ): Promise<TargetDispatchResult> {
    if (!this.gateway) {
      return {
        ok: false,
        error: 'telegram target: gateway client unwired (not configured)',
        held: false,
      };
    }
    const result = await this.gateway.sendViaGateway({
      botId: this.mapping?.resolveGatewayId(input.botId) ?? input.botId,
      chatId: input.chatId,
      kind: 'message',
      text: input.content,
      clientMsgId:
        input.clientMsgId ?? `target:telegram:${input.botId}:${Date.now()}`,
    });
    if (!result.ok) {
      return {
        ok: false,
        error: result.error ?? 'gateway send failed',
        held: false,
      };
    }
    this.markSent({ botId: input.botId, target: 'telegram' });
    return { ok: true, remoteId: String(result.messageId ?? 'gateway-ok') };
  }

  private async dispatchThreads(
    input: TargetDispatchInput,
  ): Promise<TargetDispatchResult> {
    if (!this.threads) {
      return {
        ok: false,
        error: 'threads target: threads-publisher client unwired',
        held: false,
      };
    }
    return this.threads.enqueue({
      botId: input.botId,
      chatId: input.chatId,
      content: input.content,
      clientMsgId: input.clientMsgId,
    });
  }
}
