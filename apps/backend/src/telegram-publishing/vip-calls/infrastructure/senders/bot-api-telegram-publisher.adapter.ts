import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramPublisherPort } from 'telegram-publishing/shared';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';

interface AppConfigShape {
  readonly telegram: {
    readonly botToken: string;
  };
  readonly publishing: {
    readonly vipCalls: {
      readonly botToken: string;
      readonly outputChannel: string;
    };
  };
}

@Injectable()
export class VipCallsBotApiPublisherAdapter extends TelegramPublisherPort {
  private readonly logger = new Logger(VipCallsBotApiPublisherAdapter.name);
  private static readonly MAX_LENGTH = 4096;
  private static readonly CAPTION_MAX_LENGTH = 1024;
  private static readonly API_BASE = 'https://api.telegram.org/bot';

  private readonly botToken: string;
  private readonly outputChannel: string;

  public constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    super();
    this.botToken = this.resolveBotToken();
    this.outputChannel = this.resolveOutputChannel();
  }

  private resolveBotToken(): string {
    const cfg = this.configService.get<AppConfigShape>('app');
    const token = cfg?.publishing?.vipCalls?.botToken;
    if (!token) {
      this.logger.error('VIP_CALLS_BOT_TOKEN not configured');
      throw new Error('VIP_CALLS_BOT_TOKEN not configured');
    }
    return token;
  }

  private resolveOutputChannel(): string {
    const cfg = this.configService.get<AppConfigShape>('app');
    const channel = cfg?.publishing?.vipCalls?.outputChannel;
    if (!channel) {
      this.logger.error('VIP_CALLS_OUTPUT_CHANNEL not configured');
      throw new Error('VIP_CALLS_OUTPUT_CHANNEL not configured');
    }
    return channel;
  }

  public async sendMessage(
    _chatId: string,
    text: string,
    imageUrl?: string,
  ): Promise<{
    readonly ok: boolean;
    readonly messageId: number | null;
    readonly error: string | null;
  }> {
    const chatId = this.outputChannel;

    if (!text || text.length === 0) {
      return { ok: false, messageId: null, error: 'empty message' };
    }

    try {
      if (imageUrl) {
        return await this.sendWithPhoto(chatId, text, imageUrl);
      }

      const chunks = this.splitMessage(text);
      let lastMessageId: number | null = null;

      for (const chunk of chunks) {
        const result = await this.sendChunk(chatId, chunk);
        if (!result.ok) {
          return result;
        }
        lastMessageId = result.messageId;
      }

      this.logger.log(
        `Sent message to ${chatId}, message_id: ${lastMessageId}`,
      );
      return { ok: true, messageId: lastMessageId, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(`sendMessage failed for ${chatId}: ${message}`);
      return { ok: false, messageId: null, error: message };
    }
  }

  private async sendWithPhoto(
    chatId: string,
    text: string,
    imageUrl: string,
  ): Promise<{
    readonly ok: boolean;
    readonly messageId: number | null;
    readonly error: string | null;
  }> {
    let lastMessageId: number | null = null;

    const caption =
      text.length <= VipCallsBotApiPublisherAdapter.CAPTION_MAX_LENGTH
        ? text
        : text.slice(0, VipCallsBotApiPublisherAdapter.CAPTION_MAX_LENGTH - 1) +
          '…';

    const photoResult = await this.sendPhotoChunk(chatId, imageUrl, caption);
    if (!photoResult.ok) {
      return photoResult;
    }
    lastMessageId = photoResult.messageId;

    if (text.length > VipCallsBotApiPublisherAdapter.CAPTION_MAX_LENGTH) {
      const remaining = text.slice(
        VipCallsBotApiPublisherAdapter.CAPTION_MAX_LENGTH - 1,
      );
      const chunks = this.splitMessage(remaining);
      for (const chunk of chunks) {
        const result = await this.sendChunk(chatId, chunk);
        if (!result.ok) {
          return result;
        }
        lastMessageId = result.messageId;
      }
    }

    this.logger.log(
      `Sent photo+message to ${chatId}, message_id: ${lastMessageId}`,
    );
    return { ok: true, messageId: lastMessageId, error: null };
  }

  private splitMessage(text: string): string[] {
    if (text.length <= VipCallsBotApiPublisherAdapter.MAX_LENGTH) {
      return [text];
    }
    const chunks: string[] = [];
    for (
      let i = 0;
      i < text.length;
      i += VipCallsBotApiPublisherAdapter.MAX_LENGTH
    ) {
      chunks.push(text.slice(i, i + VipCallsBotApiPublisherAdapter.MAX_LENGTH));
    }
    return chunks;
  }

  private async sendChunk(
    chatId: string,
    text: string,
  ): Promise<{
    readonly ok: boolean;
    readonly messageId: number | null;
    readonly error: string | null;
  }> {
    const url = `${VipCallsBotApiPublisherAdapter.API_BASE}${this.botToken}/sendMessage`;

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

  private async sendPhotoChunk(
    chatId: string,
    imageUrl: string,
    caption: string,
  ): Promise<{
    readonly ok: boolean;
    readonly messageId: number | null;
    readonly error: string | null;
  }> {
    const url = `${VipCallsBotApiPublisherAdapter.API_BASE}${this.botToken}/sendPhoto`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, {
          chat_id: chatId,
          photo: imageUrl,
          caption: caption,
          parse_mode: 'Markdown',
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
        this.logger.error(`Telegram sendPhoto API error: ${errorDesc}`);
        return {
          ok: false,
          messageId: null,
          error: errorDesc,
        };
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'HTTP request failed';
      this.logger.error(`sendPhoto HTTP request failed: ${message}`);
      return { ok: false, messageId: null, error: message };
    }
  }
}
