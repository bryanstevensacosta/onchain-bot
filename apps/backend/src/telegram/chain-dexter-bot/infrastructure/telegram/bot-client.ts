import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { ChainDexterBotConfigService } from '../../bot.config';

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  reply_to_message?: TelegramMessage;
  entities?: ReadonlyArray<{ type: string; offset: number; length: number }>;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  chat_instance: string;
  data?: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}

export interface SendMessageOptions {
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  disable_web_page_preview?: boolean;
  reply_markup?: InlineKeyboardMarkup;
  reply_to_message_id?: number;
}

export interface TelegramResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

@Injectable()
export class TelegramBotClient {
  private readonly logger = new Logger(TelegramBotClient.name);
  private static readonly API_BASE = 'https://api.telegram.org/bot';

  public constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly botConfig: ChainDexterBotConfigService,
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
      if (!data.ok) {
        this.logger.error(
          `getUpdates failed: ${data.description ?? 'unknown'}`,
        );
        return [];
      }
      return data.result ?? [];
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'HTTP request failed';
      this.logger.warn(`getUpdates network error: ${message}`);
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
