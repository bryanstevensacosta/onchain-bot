import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramPublisherPort, type SendResult } from 'telegram/shared';
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
  private static readonly RATE_LIMIT_MS = 60_000;

  private readonly botToken: string;
  private readonly outputChannel: string;

  private lastSentAt = 0;
  private processing = false;
  private readonly pendingQueue: Array<{
    text: string;
    imageUrl: string | undefined;
    resolve: (result: SendResult) => void;
  }> = [];

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
  ): Promise<SendResult> {
    if (!text || text.length === 0) {
      return { ok: false, messageId: null, error: 'empty message' };
    }

    return new Promise((resolve) => {
      this.pendingQueue.push({ text, imageUrl, resolve });
      if (!this.processing) {
        this.processing = true;
        void this.processQueue();
      }
    });
  }

  /**
   * `sendPhoto` (local-file multipart upload) is not used by the
   * vip-calls flow — vip-calls only sends remote URLs. The crypto-news
   * BC has its own dedicated publisher adapter that owns this path.
   * Stubbed here to satisfy the abstract port contract.
   */
  public async sendPhoto(
    _chatId: string,
    _text: string,
    _imagePath: string,
  ): Promise<SendResult> {
    return {
      ok: false,
      messageId: null,
      error: 'sendPhoto not implemented for vip-calls',
    };
  }

  public async sendMediaGroup(
    _chatId: string,
    _text: string,
    _imagePaths: string[],
  ): Promise<SendResult> {
    return {
      ok: false,
      messageId: null,
      error: 'sendMediaGroup not implemented for vip-calls',
    };
  }

  /**
   * `sendVideo` (local-file multipart upload) is not used by the
   * vip-calls flow — only the crypto-news publisher needs it.
   * Stubbed here to satisfy the abstract port contract.
   */
  public async sendVideo(
    _chatId: string,
    _text: string,
    _videoPath: string,
  ): Promise<SendResult> {
    return {
      ok: false,
      messageId: null,
      error: 'sendVideo not implemented for vip-calls',
    };
  }

  private async processQueue(): Promise<void> {
    while (this.pendingQueue.length > 0) {
      const elapsed = Date.now() - this.lastSentAt;
      if (elapsed < VipCallsBotApiPublisherAdapter.RATE_LIMIT_MS) {
        const waitMs = VipCallsBotApiPublisherAdapter.RATE_LIMIT_MS - elapsed;
        this.logger.debug(
          `Rate limit: waiting ${waitMs}ms before next send (${this.pendingQueue.length} queued)`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      if (this.pendingQueue.length === 0) break;

      const entry = this.pendingQueue.shift()!;
      this.lastSentAt = Date.now();
      try {
        const result = await this.sendOne(entry.text, entry.imageUrl);
        entry.resolve(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        this.logger.error(`sendOne failed: ${message}`);
        entry.resolve({ ok: false, messageId: null, error: message });
      }
    }
    this.processing = false;
  }

  private async sendOne(text: string, imageUrl?: string): Promise<SendResult> {
    const chatId = this.outputChannel;
    try {
      if (imageUrl) {
        return await this.sendWithPhoto(chatId, text, imageUrl);
      }
      const chunks = this.splitMessage(text);
      let lastMessageId: number | null = null;
      for (const chunk of chunks) {
        const result = await this.sendChunk(chatId, chunk);
        if (!result.ok) return result;
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
  ): Promise<SendResult> {
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

  private async sendChunk(chatId: string, text: string): Promise<SendResult> {
    const url = `${VipCallsBotApiPublisherAdapter.API_BASE}${this.botToken}/sendMessage`;

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, {
          chat_id: chatId,
          text: text,
          parse_mode: 'Markdown',
          disable_web_page_preview: false,
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
  ): Promise<SendResult> {
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
