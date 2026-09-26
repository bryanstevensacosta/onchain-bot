import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ScheduledAdDispatcherPort,
  type ScheduledAdDispatchResult,
} from 'scheduling/domain/ports/scheduled-ad-dispatcher.port';
import type { ScheduledAd } from 'scheduling/domain/scheduled-ad.entity';
import type { SchedulingTarget } from 'scheduling/domain/scheduling-target';
import type { TelegramSendResult } from '../../domain/ports/telegram-send-result';
import { SchedulingGatewaySenderPort } from '../../domain/ports/scheduling-gateway-sender.port';
import { DualSendParityService } from '../services/dual-send-parity.service';
import { GatewayBotMappingService } from '../../infrastructure/gateway/gateway-bot-mapping.service';

export interface ScheduledPostSendInput {
  readonly postId: string;
  readonly botId: string;
  readonly chatId: string;
  readonly text: string;
  readonly photoUrl?: string;
  readonly media?: ReadonlyArray<Record<string, unknown>>;
  readonly clientMsgId?: string;
}

/**
 * Gateway-only dispatcher (P42: the ONLY transport in this app).
 *
 * Rotation path (`publish`, the moved `ScheduledAdDispatcherPort`
 * binding): route by target (`telegram`/`threads` -> env channel, the
 * legacy rotation path pending session bindings) -> send text-only
 * ads via the gateway with parity recorded. Button/media ads are
 * gateway-incompatible: recorded as skipped and returned as
 * `not configured` (the rotation use-case holds them enabled without
 * failure bookkeeping) — there is deliberately NO direct Bot API leg
 * to fall back to. Missing channel/vault mapping is the same
 * not-configured shape (dashboard-only boot never crashes).
 *
 * Contract path (`publishScheduledPost`): session-bound posts carry
 * their own vault `botId` + verified `chatId`; the plaintext token
 * never appears here. Never throws: failures return `{ ok: false }`
 * so the fire path can classify them into contract §6 codes.
 */
@Injectable()
export class SchedulingGatewayDispatcher extends ScheduledAdDispatcherPort {
  public constructor(
    private readonly config: ConfigService,
    @Optional()
    private readonly gateway?: SchedulingGatewaySenderPort,
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
    const chatId = this.resolveChannel(target);
    if (!chatId) {
      return {
        ok: false,
        messageId: null,
        error:
          `SchedulingGatewayDispatcher: missing targetChannel for ${target} (not configured)`,
      };
    }
    if (!this.isGatewayCompatible(ad)) {
      this.parity?.recordSkipped({
        postId: `ad:${ad.id}`,
        botId: this.vaultBotId(target),
        chatId,
        shape: 'buttons-or-media',
        chunks: 1,
      });
      return {
        ok: false,
        messageId: null,
        error:
          'SchedulingGatewayDispatcher: gateway supports text-only posts without buttons — ' +
          'button/media posts need gateway upload/reply_markup support (not configured)',
      };
    }
    const result = await this.send({
      postId: `ad:${ad.id}`,
      kind: 'message',
      botId: this.vaultBotId(target),
      chatId,
      text: ad.body,
      clientMsgId: `scheduling:${ad.id}:${target}`,
    });
    return { ok: result.ok, messageId: result.messageId, error: result.error };
  }

  public async publishScheduledPost(
    input: ScheduledPostSendInput,
  ): Promise<TelegramSendResult> {
    if (input.media && input.media.length >= 2) {
      return this.send({
        postId: input.postId,
        kind: 'media_group',
        botId: this.mapping?.resolveGatewayId(input.botId) ?? input.botId,
        chatId: input.chatId,
        text: input.text,
        media: input.media,
        clientMsgId: input.clientMsgId ?? input.postId,
      });
    }
    if (input.photoUrl) {
      return this.send({
        postId: input.postId,
        kind: 'photo',
        botId: this.mapping?.resolveGatewayId(input.botId) ?? input.botId,
        chatId: input.chatId,
        text: input.text,
        photoUrl: input.photoUrl,
        clientMsgId: input.clientMsgId ?? input.postId,
      });
    }
    return this.send({
      postId: input.postId,
      kind: 'message',
      botId: this.mapping?.resolveGatewayId(input.botId) ?? input.botId,
      chatId: input.chatId,
      text: input.text,
      clientMsgId: input.clientMsgId ?? input.postId,
    });
  }

  private async send(input: {
    postId: string;
    botId: string;
    chatId: string;
    text: string;
    kind: 'message' | 'photo' | 'media_group';
    photoUrl?: string;
    media?: ReadonlyArray<Record<string, unknown>>;
    clientMsgId: string;
  }): Promise<TelegramSendResult> {
    if (!this.gateway) {
      return {
        ok: false,
        messageId: null,
        error: 'SchedulingGatewayDispatcher: gateway client unwired (not configured)',
      };
    }
    const result = await this.gateway.sendViaGateway({
      botId: input.botId,
      chatId: input.chatId,
      kind: input.kind,
      text: input.text,
      ...(input.photoUrl ? { photoUrl: input.photoUrl } : {}),
      ...(input.media ? { media: input.media } : {}),
      clientMsgId: input.clientMsgId,
    });
    this.parity?.record({
      postId: input.postId,
      botId: input.botId,
      chatId: input.chatId,
      shape: input.kind,
      plannedOk: true,
      gateway: result,
      chunks: 1,
    });
    return result;
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
