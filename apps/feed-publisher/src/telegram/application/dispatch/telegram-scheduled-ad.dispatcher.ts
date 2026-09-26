import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ScheduledAdDispatcherPort,
  type ScheduledAdDispatchResult,
} from '../../../scheduling/domain/ports/scheduled-ad-dispatcher.port';
import type { ScheduledAd } from '../../../scheduling/domain/scheduled-ad.entity';
import type { SchedulingTarget } from '../../../scheduling/domain/scheduling-target';
import type { TelegramInlineKeyboard } from '../../domain/ports/message-format.types';
import { TelegramPublisherRouter } from '../services/telegram-publisher-router.service';
import { BotsGatewaySenderPort } from '../../domain/ports/bots-gateway-sender.port';
import { DualSendParityService } from '../services/dual-send-parity.service';
import { GatewayBotMappingService } from '../../infrastructure/gateway/gateway-bot-mapping.service';
import { resolveFeedPublishMode } from '../../infrastructure/gateway/publish-mode';

/**
 * LIVE `ScheduledAdDispatcherPort` binding (Tramo 2, todo 7 — replaces
 * the in-memory recorder; the recorder remains as a test double only).
 *
 * Scheduling path: route by target (`telegram` -> crypto bot,
 * `threads` -> threads bot) -> send the ad body via `sendMessage`
 * with the ad buttons mapped to one inline-keyboard row each.
 *
 * Never throws: failures return `{ ok: false }` so
 * `PublishScheduledAdUseCase` books them (3 consecutive -> disable).
 * Missing channel/token errors carry `not configured` + the token env
 * name, which the use-case treats as not-configured: no failure
 * bookkeeping, the post stays enabled.
 *
 * Deliberate v1 limit: ad MEDIA (library `imageMediaId`/`videoMediaId`
 * /album) is not resolved here — those ids need the scheduling media
 * storage port, which lives behind `SchedulingModule` (importing it
 * would cycle the module graph). Text posts publish today; media
 * resolution is a follow-up once the storage port is shared.
 */
@Injectable()
export class TelegramScheduledAdDispatcher extends ScheduledAdDispatcherPort {
  public constructor(
    private readonly router: TelegramPublisherRouter,
    private readonly config: ConfigService,
    @Optional()
    private readonly gateway?: BotsGatewaySenderPort,
    @Optional()
    private readonly parity?: DualSendParityService,
    @Optional()
    private readonly mapping?: GatewayBotMappingService,
  ) {
    super();
  }

  public async publish(
    ad: ScheduledAd,
    target: SchedulingTarget,
  ): Promise<ScheduledAdDispatchResult> {
    const mode = resolveFeedPublishMode(this.config);
    if (mode === 'gateway') {
      return this.publishViaGateway(ad, target);
    }
    const direct = await this.publishDirect(ad, target);
    if (mode === 'dual') {
      await this.compareGatewayLeg(ad, target, direct);
    }
    return direct;
  }

  private async publishDirect(
    ad: ScheduledAd,
    target: SchedulingTarget,
  ): Promise<ScheduledAdDispatchResult> {
    let adapter;
    try {
      adapter = this.router.forSchedulingTarget(target);
    } catch (err) {
      return {
        ok: false,
        messageId: null,
        error: (err as Error).message,
      };
    }
    const chatId = this.resolveChannel(target);
    if (!chatId) {
      const tokenName =
        target === 'threads' ? 'THREADS_BOT_TOKEN' : 'CRYPTO_NEWS_BOT_TOKEN';
      const channelName =
        target === 'threads'
          ? 'THREADS_OUTPUT_CHANNEL'
          : 'CRYPTO_NEWS_OUTPUT_CHANNEL';
      return {
        ok: false,
        messageId: null,
        error:
          `TelegramScheduledAdDispatcher: missing targetChannel/${channelName} ` +
          `for ${tokenName} (not configured)`,
      };
    }
    const buttons = ad.buttons ?? [];
    const replyMarkup: TelegramInlineKeyboard | undefined =
      buttons.length > 0
        ? buttons.map((button) => [{ text: button.text, url: button.url }])
        : undefined;
    const result = await adapter.sendMessage(
      chatId,
      ad.body,
      undefined,
      replyMarkup ? { replyMarkup } : undefined,
    );
    return { ok: result.ok, messageId: result.messageId, error: result.error };
  }

  private async compareGatewayLeg(
    ad: ScheduledAd,
    target: SchedulingTarget,
    direct: ScheduledAdDispatchResult,
  ): Promise<void> {
    if (!this.gateway || !this.parity) return;
    const chatId = this.resolveChannel(target);
    if (!this.isGatewayCompatible(ad)) {
      this.parity.recordSkipped({
        botId: this.vaultBotId(target),
        chatId,
        shape: 'buttons-or-media',
        chunks: 1,
      });
      return;
    }
    const gateway = await this.gateway.sendViaGateway({
      botId: this.vaultBotId(target),
      chatId,
      kind: 'message',
      text: ad.body,
      clientMsgId: `scheduling:${ad.id}:${target}`,
    });
    this.parity.record({
      botId: this.vaultBotId(target),
      chatId,
      shape: 'message',
      direct,
      gateway,
      chunks: 1,
    });
  }

  private async publishViaGateway(
    ad: ScheduledAd,
    target: SchedulingTarget,
  ): Promise<ScheduledAdDispatchResult> {
    if (!this.gateway) {
      return {
        ok: false,
        messageId: null,
        error:
          'TelegramScheduledAdDispatcher: gateway client unwired (not configured)',
      };
    }
    const chatId = this.resolveChannel(target);
    if (!chatId) {
      const tokenName =
        target === 'threads' ? 'THREADS_BOT_TOKEN' : 'CRYPTO_NEWS_BOT_TOKEN';
      return {
        ok: false,
        messageId: null,
        error: `TelegramScheduledAdDispatcher: missing targetChannel for ${tokenName} (not configured)`,
      };
    }
    if (!this.isGatewayCompatible(ad)) {
      return {
        ok: false,
        messageId: null,
        error:
          'TelegramScheduledAdDispatcher: gateway supports text-only ads without buttons — ' +
          'button/media ads need the direct leg (dual mode) until gateway todo 7 (not configured)',
      };
    }
    const result = await this.gateway.sendViaGateway({
      botId: this.vaultBotId(target),
      chatId,
      kind: 'message',
      text: ad.body,
      clientMsgId: `scheduling:${ad.id}:${target}`,
    });
    return { ok: result.ok, messageId: result.messageId, error: result.error };
  }

  private isGatewayCompatible(ad: ScheduledAd): boolean {
    const buttons = ad.buttons ?? [];
    return ad.format === 'text' && buttons.length === 0;
  }

  private vaultBotId(target: SchedulingTarget): string {
    const localKey =
      target === 'threads'
        ? 'env:THREADS_BOT_TOKEN'
        : 'env:CRYPTO_NEWS_BOT_TOKEN';
    return this.mapping?.resolveGatewayId(localKey) ?? localKey;
  }

  private resolveChannel(target: SchedulingTarget): string {
    const envName =
      target === 'threads'
        ? 'THREADS_OUTPUT_CHANNEL'
        : 'CRYPTO_NEWS_OUTPUT_CHANNEL';
    return (this.config.get<string>(envName, '') ?? '').trim();
  }
}
