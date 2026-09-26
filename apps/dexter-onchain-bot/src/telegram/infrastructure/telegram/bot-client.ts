import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { randomUUID } from 'node:crypto';
import { DexterBotConfigService } from '../../../settings/infrastructure/config/bot.config';
import { GatewaySendClient } from '../gateway/gateway-send-client.service';
import { GatewayBotMappingService } from '../gateway/gateway-bot-mapping.service';
import { DualSendParityService } from '../../application/services/dual-send-parity.service';
import type {
  SendMessageOptions,
  TelegramResponse,
  TelegramUpdate,
  TelegramUser,
} from '../../domain/ports/telegram.port';

export type {
  InlineKeyboardButton,
  InlineKeyboardMarkup,
  SendMessageOptions,
  TelegramCallbackQuery,
  TelegramChat,
  TelegramMessage,
  TelegramResponse,
  TelegramUpdate,
  TelegramUser,
} from '../../domain/ports/telegram.port';

/**
 * Telegram Bot API types + client (moved from backend chain-dexter-bot
 * `infrastructure/telegram/bot-client.ts` — config import re-pointed at
 * the local DexterBotConfigService).
 *
 * Lookup-only: sendMessage/editMessageText/answerCallbackQuery answer
 * user lookups; this client NEVER posts to channels.
 *
 * @deprecated Dual-leg only (telegram-bots-gateway todo 6): `sendMessage`
 * routes through `DEXTER_SEND_MODE` (`direct` legacy | `dual` both legs +
 * parity, returns direct | `gateway` vault-id only, fail-closed). The
 * gateway leg resolves the token server-side from the vault id — the
 * client never sends `DEXTER_BOT_TOKEN` there. `editMessageText`,
 * `answerCallbackQuery`, `getUpdates`, `setWebhook` have no gateway
 * equivalent and stay direct-only (recorded as skipped). Removed at
 * gateway todo 7.
 */
@Injectable()
export class TelegramBotClient {
  private readonly logger = new Logger(TelegramBotClient.name);
  private static readonly API_BASE = 'https://api.telegram.org/bot';
  private static readonly LOCAL_ID = 'dexter';
  private static readonly MAX_LENGTH = 4096;

  public constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly botConfig: DexterBotConfigService,
    @Optional() private readonly gateway?: GatewaySendClient,
    @Optional() private readonly mapping?: GatewayBotMappingService,
    @Optional() private readonly parity?: DualSendParityService,
  ) {}

  private get apiBase(): string {
    const token = this.botConfig.get().botToken;
    return `${TelegramBotClient.API_BASE}${token}/`;
  }

  public async sendMessage(
    chatId: number | string,
    text: string,
    options: SendMessageOptions = {},
  ): Promise<{ ok: boolean; messageId: number | null; error: string | null }> {
    const mode = this.botConfig.get().sendMode ?? 'dual';
    if (mode === 'gateway') {
      return this.sendViaGatewayOnly(chatId, text, options);
    }
    const direct = await this.sendDirect(chatId, text, options);
    if (mode === 'dual') {
      await this.runGatewayLeg(chatId, text, options, direct);
    }
    return direct;
  }

  private resolveVaultId(): string {
    const mapped =
      this.mapping?.resolveGatewayId(TelegramBotClient.LOCAL_ID) ??
      TelegramBotClient.LOCAL_ID;
    if (mapped !== TelegramBotClient.LOCAL_ID) return mapped;
    return this.botConfig.get().botVaultId ?? '';
  }

  private static chunkCount(text: string): number {
    return Math.max(1, Math.ceil(text.length / TelegramBotClient.MAX_LENGTH));
  }

  private async runGatewayLeg(
    chatId: number | string,
    text: string,
    options: SendMessageOptions,
    direct: { ok: boolean; messageId: number | null; error: string | null },
  ): Promise<void> {
    if (!this.gateway || !this.parity) return;
    const chat = String(chatId);
    const vaultId = this.resolveVaultId();
    if (!vaultId) {
      this.parity.record({
        botId: TelegramBotClient.LOCAL_ID,
        chatId: chat,
        shape: 'message',
        direct,
        gateway: { ok: false, messageId: null, error: 'no gateway vault id' },
        chunks: TelegramBotClient.chunkCount(text),
      });
      return;
    }
    if (options.reply_markup) {
      this.parity.recordSkipped({
        botId: vaultId,
        chatId: chat,
        shape: 'keyboard',
        chunks: TelegramBotClient.chunkCount(text),
      });
      return;
    }
    const gateway = await this.gateway.sendViaGateway({
      botId: vaultId,
      chatId: chat,
      text,
      parseMode: options.parse_mode,
      clientMsgId: `dexter-${randomUUID()}`,
    });
    this.parity.record({
      botId: vaultId,
      chatId: chat,
      shape: 'message',
      direct,
      gateway,
      chunks: TelegramBotClient.chunkCount(text),
    });
  }

  private async sendViaGatewayOnly(
    chatId: number | string,
    text: string,
    options: SendMessageOptions,
  ): Promise<{ ok: boolean; messageId: number | null; error: string | null }> {
    if (!this.gateway) {
      return {
        ok: false,
        messageId: null,
        error: 'gateway client not wired',
      };
    }
    if (options.reply_markup) {
      return {
        ok: false,
        messageId: null,
        error: 'gateway: reply_markup not supported (direct-only shape)',
      };
    }
    const vaultId = this.resolveVaultId();
    if (!vaultId) {
      return {
        ok: false,
        messageId: null,
        error:
          'no gateway vault id — run POST /api/dexter-bots/migrate-to-gateway',
      };
    }
    return this.gateway.sendViaGateway({
      botId: vaultId,
      chatId: String(chatId),
      text,
      parseMode: options.parse_mode,
      clientMsgId: `dexter-${randomUUID()}`,
    });
  }

  private async sendDirect(
    chatId: number | string,
    text: string,
    options: SendMessageOptions = {},
  ): Promise<{ ok: boolean; messageId: number | null; error: string | null }> {
    const start = Date.now();
    try {
      const response = await firstValueFrom(
        this.httpService.post<TelegramResponse<{ message_id: number }>>(
          `${this.apiBase}sendMessage`,
          {
            chat_id: chatId,
            text,
            parse_mode: options.parse_mode ?? 'Markdown',
            disable_web_page_preview: options.disable_web_page_preview ?? true,
            reply_markup: options.reply_markup,
            reply_to_message_id: options.reply_to_message_id,
          },
        ),
      );
      const data = response.data;
      const latency = Date.now() - start;
      if (data.ok) {
        this.logger.log(
          `sendMessage chatId=${chatId} latency=${latency}ms messageId=${data.result?.message_id}`,
        );
        return {
          ok: true,
          messageId: data.result?.message_id ?? null,
          error: null,
        };
      }
      this.logger.error(
        `sendMessage failed chatId=${chatId}: ${data.description ?? 'unknown'}`,
      );
      return {
        ok: false,
        messageId: null,
        error: data.description ?? 'unknown error',
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'HTTP request failed';
      this.logger.error(
        `sendMessage HTTP error chatId=${chatId} latency=${Date.now() - start}ms: ${message}`,
      );
      return { ok: false, messageId: null, error: message };
    }
  }

  public async editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    options: Omit<SendMessageOptions, 'reply_to_message_id'> = {},
  ): Promise<{ ok: boolean; error: string | null }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<TelegramResponse<boolean>>(
          `${this.apiBase}editMessageText`,
          {
            chat_id: chatId,
            message_id: messageId,
            text,
            parse_mode: options.parse_mode ?? 'Markdown',
            disable_web_page_preview: options.disable_web_page_preview ?? true,
            reply_markup: options.reply_markup,
          },
        ),
      );
      const data = response.data;
      if (data.ok) {
        return { ok: true, error: null };
      }
      return { ok: false, error: data.description ?? 'unknown error' };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'HTTP request failed';
      this.logger.error(`editMessageText failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  public async answerCallbackQuery(
    callbackQueryId: string,
    text?: string,
    showAlert = false,
  ): Promise<{ ok: boolean; error: string | null }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<TelegramResponse<boolean>>(
          `${this.apiBase}answerCallbackQuery`,
          {
            callback_query_id: callbackQueryId,
            text,
            show_alert: showAlert,
          },
        ),
      );
      const data = response.data;
      return data.ok
        ? { ok: true, error: null }
        : { ok: false, error: data.description ?? 'unknown' };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'HTTP request failed';
      this.logger.error(`answerCallbackQuery failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  public async getUpdates(
    offset: number | null,
    timeoutSec = 30,
    allowedUpdates: ReadonlyArray<
      'message' | 'edited_message' | 'callback_query'
    > = ['message', 'callback_query'],
  ): Promise<TelegramUpdate[]> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<TelegramResponse<TelegramUpdate[]>>(
          `${this.apiBase}getUpdates`,
          {
            offset,
            timeout: timeoutSec,
            allowed_updates: allowedUpdates,
          },
        ),
      );
      const data = response.data;
      if (data.ok && Array.isArray(data.result)) {
        return data.result;
      }
      this.logger.warn(
        `getUpdates returned not-ok: ${data.description ?? 'unknown'}`,
      );
      return [];
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'HTTP request failed';
      this.logger.warn(`getUpdates failed: ${message}`);
      return [];
    }
  }

  public async setWebhook(
    url: string,
    secretToken?: string,
  ): Promise<{ ok: boolean; error: string | null }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<TelegramResponse<boolean>>(
          `${this.apiBase}setWebhook`,
          {
            url,
            secret_token: secretToken,
            allowed_updates: ['message', 'callback_query'],
          },
        ),
      );
      const data = response.data;
      return data.ok
        ? { ok: true, error: null }
        : { ok: false, error: data.description ?? 'unknown' };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'HTTP request failed';
      this.logger.error(`setWebhook failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  public async deleteWebhook(
    dropPendingUpdates = false,
  ): Promise<{ ok: boolean; error: string | null }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<TelegramResponse<boolean>>(
          `${this.apiBase}deleteWebhook`,
          {
            drop_pending_updates: dropPendingUpdates,
          },
        ),
      );
      const data = response.data;
      return data.ok
        ? { ok: true, error: null }
        : { ok: false, error: data.description ?? 'unknown' };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'HTTP request failed';
      this.logger.error(`deleteWebhook failed: ${message}`);
      return { ok: false, error: message };
    }
  }

  public async getMe(): Promise<{
    ok: boolean;
    bot?: TelegramUser;
    error: string | null;
  }> {
    try {
      const response = await firstValueFrom(
        this.httpService.post<TelegramResponse<TelegramUser>>(
          `${this.apiBase}getMe`,
          {},
        ),
      );
      const data = response.data;
      if (data.ok && data.result) {
        return { ok: true, bot: data.result, error: null };
      }
      return {
        ok: false,
        bot: undefined,
        error: data.description ?? 'unknown',
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'HTTP request failed';
      return { ok: false, bot: undefined, error: message };
    }
  }
}
