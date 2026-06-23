import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';
import { TokenScanService } from '../../application/token-scan.service';
import { MessageFormatterAdapter } from './message-formatter.adapter';

interface AppConfigShape {
  readonly publishing: {
    readonly chainDexterBot: {
      readonly botToken: string;
    };
  };
}

interface TelegramUpdate {
  message?: { chat: { id: number }; text?: string };
  edited_message?: { chat: { id: number }; text?: string };
}

@Injectable()
export class ChainDexterBotAdapter {
  private readonly logger = new Logger(ChainDexterBotAdapter.name);
  private static readonly API_BASE = 'https://api.telegram.org/bot';

  private readonly botToken: string;

  public constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly tokenScanService: TokenScanService,
    private readonly formatter: MessageFormatterAdapter,
  ) {
    this.botToken = this.resolveBotToken();
  }

  private resolveBotToken(): string {
    const cfg = this.configService.get<AppConfigShape>('app');
    const token = cfg?.publishing?.chainDexterBot?.botToken;
    if (!token) {
      this.logger.warn('CHAIN_DEXTER_BOT_TOKEN not configured');
      return '';
    }
    return token;
  }

  public async handleUpdate(update: TelegramUpdate): Promise<void> {
    if (!this.botToken) {
      this.logger.warn('Bot token not configured, ignoring updates');
      return;
    }

    const message = update.message || update.edited_message;
    if (!message?.text) return;

    const chatId = message.chat.id;
    const text = message.text;

    const caRegex = /\b[0-9a-zA-Z]{32,44}\b/g;
    const contractAddresses = text.match(caRegex);

    if (!contractAddresses || contractAddresses.length === 0) {
      return;
    }

    for (const ca of contractAddresses) {
      const tokenInfo = await this.tokenScanService.getTokenInfo(ca);
      if (!tokenInfo) {
        await this.sendMessage(chatId, `No data found for ${ca}`);
        continue;
      }

      const response = this.formatter.format(tokenInfo);
      await this.sendMessage(chatId, response);
    }
  }

  public async sendMessage(
    chatId: number,
    text: string,
  ): Promise<{ ok: boolean; messageId: number | null; error: string | null }> {
    if (!this.botToken) {
      return { ok: false, messageId: null, error: 'Bot not configured' };
    }

    const url = `${ChainDexterBotAdapter.API_BASE}${this.botToken}/sendMessage`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, {
          chat_id: chatId,
          text: text,
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
        }),
      );

      const data = response.data as {
        ok: boolean;
        result?: { message_id: number };
        description?: string;
      };

      if (data.ok) {
        return {
          ok: true,
          messageId: data.result?.message_id ?? null,
          error: null,
        };
      } else {
        const errorDesc = data.description || 'unknown error';
        this.logger.error(`Telegram API error: ${errorDesc}`);
        return {
          ok: false,
          messageId: null,
          error: errorDesc,
        };
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'HTTP request failed';
      this.logger.error(`HTTP request failed: ${message}`);
      return { ok: false, messageId: null, error: message };
    }
  }
}
