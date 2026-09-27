import { Injectable, Optional } from '@nestjs/common';
import {
  TargetDispatcherPort,
  type TargetDispatchInput,
  type TargetDispatchResult,
} from '../ports/target-dispatcher.port';
import { BotsGatewaySenderPort } from '../../../telegram/domain/ports/bots-gateway-sender.port';
import { GatewayBotMappingService } from '../../../telegram/infrastructure/gateway/gateway-bot-mapping.service';
import { ThreadsPublisherHttpClient } from '../../infrastructure/threads/threads-publisher-http-client';

/**
 * Unified target dispatcher (threads-publisher plan Fase 2 todo 10,
 * P38-bis per-binding config).
 *
 * Replaces direct `src/telegram/` + threads-stub call sites:
 * `telegram` bindings send via the telegram-bots-gateway (vault id
 * only, resolved through `GatewayBotMappingService` so pre-migration
 * catalog ids keep working); `threads` bindings enqueue into
 * `apps/threads-publisher` over HTTP. Unknown targets throw
 * fail-closed. Either leg unwired returns
 * `{ ok: false, error }` — never throws at construction, so
 * dashboard-only boot keeps working.
 */
@Injectable()
export class TargetDispatcherService extends TargetDispatcherPort {
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
      return { ok: false, error: 'empty content' };
    }
    if (input.target === 'telegram') {
      return this.dispatchTelegram(input);
    }
    if (input.target === 'threads') {
      return this.dispatchThreads(input);
    }
    throw new Error(`unsupported target: ${String(input.target)}`);
  }

  private async dispatchTelegram(
    input: TargetDispatchInput,
  ): Promise<TargetDispatchResult> {
    if (!this.gateway) {
      return {
        ok: false,
        error: 'telegram target: gateway client unwired (not configured)',
      };
    }
    const result = await this.gateway.sendViaGateway({
      botId: this.mapping?.resolveGatewayId(input.botId) ?? input.botId,
      chatId: input.chatId,
      text: input.content,
      clientMsgId:
        input.clientMsgId ?? `target:telegram:${input.botId}:${Date.now()}`,
    });
    if (!result.ok) {
      return { ok: false, error: result.error ?? 'gateway send failed' };
    }
    return { ok: true, remoteId: String(result.messageId ?? 'gateway-ok') };
  }

  private async dispatchThreads(
    input: TargetDispatchInput,
  ): Promise<TargetDispatchResult> {
    if (!this.threads) {
      return {
        ok: false,
        error: 'threads target: threads-publisher client unwired',
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
