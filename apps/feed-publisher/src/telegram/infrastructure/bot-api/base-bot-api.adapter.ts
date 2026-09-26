import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request as httpsRequest } from 'node:https';
import { basename, extname } from 'node:path';
import {
  TelegramPublisherPort,
  type TelegramPublishOptions,
  type TelegramSendResult,
} from '../../domain/ports/telegram-publisher.port';
import { BotApiHttpClient } from './bot-api-http-client';
import {
  buildMediaGroupMultipartBody,
  buildMultipartBody,
} from './build-multipart-body';
import { guessMimeType } from './guess-mime-type';
import {
  readFileWithValidation,
  readMultipleFilesWithValidation,
} from './read-file';
import { TelegramRateLimiter } from '../../application/services/telegram-rate-limiter.service';

/**
 * Shared Bot API send logic for the feed bots (moved read-only from
 * the backend `BotApiCryptoNewsPublisherAdapter`, Tramo 2 todo 7).
 *
 * @deprecated Dual-leg only (telegram-bots-gateway todo 5): prefer the
 * gateway path (`FEED_PUBLISH_MODE=gateway`, vault ids from
 * `POST /api/content-template-bots/migrate-to-gateway`). Removed at the
 * global cutover (gateway todo 7). Do not extend.
 *
 * Subclasses differ ONLY in identity: token env name, default-channel
 * env name, and their own `TelegramRateLimiter` instance (per-bot
 * pacing). Tokens stay OPTIONAL at boot (dashboard-only mode): every
 * send resolves config lazily at call time and returns a clear
 * `not configured` error — never throws, never posts.
 */
export abstract class BaseBotApiAdapter extends TelegramPublisherPort {
  protected static readonly API_BASE = 'https://api.telegram.org/bot';
  private static readonly CAPTION_MAX_LENGTH = 1024;
  private static readonly TEXT_MAX_LENGTH = 4096;

  protected readonly logger: Logger;

  protected constructor(
    protected readonly config: ConfigService,
    protected readonly http: BotApiHttpClient,
    protected readonly limiter: TelegramRateLimiter,
    private readonly tokenEnvName: string,
    private readonly channelEnvName: string,
  ) {
    super();
    this.logger = new Logger(this.constructor.name);
  }

  protected resolveToken(): string {
    return (this.config.get<string>(this.tokenEnvName, '') ?? '').trim();
  }

  protected resolveDefaultChannel(): string {
    return (this.config.get<string>(this.channelEnvName, '') ?? '').trim();
  }

  private resolveChatId(chatId: string): string {
    return chatId?.trim() ? chatId.trim() : this.resolveDefaultChannel();
  }

  private requireConfig(chatId: string): string | null {
    const token = this.resolveToken();
    if (!token || !chatId) {
      return (
        `${this.constructor.name}: missing ` +
        `${!token ? this.tokenEnvName : ''}` +
        `${!token && !chatId ? ' and ' : ''}` +
        `${!chatId ? `targetChannel/${this.channelEnvName}` : ''} ` +
        `(not configured)`
      );
    }
    return null;
  }

  private checkRateLimit(): string | null {
    if (this.limiter.tryAcquire()) {
      return null;
    }
    return (
      `${this.constructor.name}: Rate limit exceeded ` +
      `(${this.limiter.limit}/min) — retry in the next window`
    );
  }

  private static normalizeBreaks(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/(?<!\n)\n(?!\n)/g, '\n\n');
  }

  private static splitAtBoundary(
    text: string,
    max: number,
  ): [string, string, boolean] {
    if (text.length <= max) return [text, '', true];
    let best = -1;
    for (const sep of ['<br><br>', '\n\n', '\n• ', '<br>• ']) {
      const idx = text.lastIndexOf(sep, max);
      if (idx > best) best = idx;
    }
    if (best > 0) {
      return [text.slice(0, best), text.slice(best).replace(/^\s+/, ''), true];
    }
    const space = text.lastIndexOf(' ', max);
    if (space > 0) {
      return [text.slice(0, space), text.slice(space + 1), false];
    }
    return [text.slice(0, max), text.slice(max), false];
  }

  private static splitOverflow(
    text: string,
    firstMax: number,
    restMax: number,
  ): string[] {
    if (text.length <= firstMax) return [text];
    const parts: string[] = [];
    const [head, firstTail, clean] = BaseBotApiAdapter.splitAtBoundary(
      text,
      firstMax - 1,
    );
    parts.push(
      clean ? head.replace(/\s+$/, '') : head.replace(/\s+$/, '') + '…',
    );
    let tail = firstTail;
    while (tail.length > restMax) {
      const [next, rest] = BaseBotApiAdapter.splitAtBoundary(tail, restMax);
      parts.push(next);
      tail = rest;
    }
    if (tail.length > 0) parts.push(tail);
    return parts;
  }

  private methodUrl(method: string): string {
    return `${BaseBotApiAdapter.API_BASE}${this.resolveToken()}/${method}`;
  }

  private async postTextChunk(
    chatId: string,
    text: string,
    parseMode: 'Markdown' | 'HTML',
    replyToMessageId?: number,
  ): Promise<TelegramSendResult> {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: false,
    };
    if (replyToMessageId !== undefined) {
      payload['reply_to_message_id'] = replyToMessageId;
    }
    return this.http.postJson(this.methodUrl('sendMessage'), payload);
  }

  private async sendContinuationChunks(
    chatId: string,
    chunks: string[],
    parseMode: 'Markdown' | 'HTML',
    replyToMessageId: number | null,
  ): Promise<void> {
    if (replyToMessageId === null) return;
    for (const chunk of chunks) {
      const res = await this.postTextChunk(
        chatId,
        chunk,
        parseMode,
        replyToMessageId,
      );
      if (res.ok) {
        this.logger.log(`sent continuation message ${res.messageId}`);
      } else {
        this.logger.warn(
          `continuation message failed (primary already posted): ${res.error}`,
        );
      }
    }
  }

  private static replyMarkupField(
    options?: TelegramPublishOptions,
  ): Array<[string, string]> {
    if (!options?.replyMarkup) return [];
    return [
      [
        'reply_markup',
        JSON.stringify({ inline_keyboard: options.replyMarkup }),
      ],
    ];
  }

  public async sendMessage(
    chatId: string,
    text: string,
    imageUrl?: string,
    options?: TelegramPublishOptions,
  ): Promise<TelegramSendResult> {
    const resolvedChatId = this.resolveChatId(chatId);
    const missing = this.requireConfig(resolvedChatId);
    if (missing) return { ok: false, messageId: null, error: missing };
    if (!text || text.length === 0) {
      return { ok: false, messageId: null, error: 'empty message' };
    }
    const limited = this.checkRateLimit();
    if (limited) return { ok: false, messageId: null, error: limited };
    const parseMode = options?.parseMode ?? 'Markdown';
    const formattedText = BaseBotApiAdapter.normalizeBreaks(text);
    const parts = BaseBotApiAdapter.splitOverflow(
      formattedText,
      BaseBotApiAdapter.TEXT_MAX_LENGTH,
      BaseBotApiAdapter.TEXT_MAX_LENGTH,
    );
    const payload: Record<string, unknown> = {
      chat_id: resolvedChatId,
      text: parts[0],
      parse_mode: parseMode,
      disable_web_page_preview: false,
    };
    if (imageUrl) {
      payload['photo'] = imageUrl;
    }
    if (options?.replyMarkup) {
      payload['reply_markup'] = { inline_keyboard: options.replyMarkup };
    }
    const primary = await this.http.postJson(
      this.methodUrl('sendMessage'),
      payload,
    );
    if (!primary.ok) return primary;
    if (parts.length > 1) {
      await this.sendContinuationChunks(
        resolvedChatId,
        parts.slice(1),
        parseMode,
        primary.messageId,
      );
    }
    return primary;
  }

  public async sendPhoto(
    chatId: string,
    text: string,
    imagePath: string,
    options?: TelegramPublishOptions,
  ): Promise<TelegramSendResult> {
    const resolvedChatId = this.resolveChatId(chatId);
    const missing = this.requireConfig(resolvedChatId);
    if (missing) return { ok: false, messageId: null, error: missing };
    if (!text || text.length === 0) {
      return { ok: false, messageId: null, error: 'empty message' };
    }
    if (!imagePath) {
      return { ok: false, messageId: null, error: 'empty image path' };
    }
    const fileResult = readFileWithValidation(imagePath, this.logger, 'photo');
    if (fileResult.error) {
      return { ok: false, messageId: null, error: fileResult.error };
    }
    const limited = this.checkRateLimit();
    if (limited) return { ok: false, messageId: null, error: limited };
    const parseMode = options?.parseMode ?? 'Markdown';
    const parts = BaseBotApiAdapter.splitOverflow(
      BaseBotApiAdapter.normalizeBreaks(text),
      BaseBotApiAdapter.CAPTION_MAX_LENGTH,
      BaseBotApiAdapter.TEXT_MAX_LENGTH,
    );
    const boundary = `----feedPublisher${crypto.randomUUID().replace(/-/g, '')}`;
    const textFields: Array<[string, string]> = [
      ['chat_id', resolvedChatId],
      ['caption', parts[0]],
      ['parse_mode', parseMode],
      ...BaseBotApiAdapter.replyMarkupField(options),
    ];
    const body = buildMultipartBody(boundary, textFields, {
      fieldName: 'photo',
      fileName: basename(imagePath),
      mimeType: guessMimeType(extname(imagePath)),
      bytes: fileResult.bytes,
    });
    const primary = await this.http.postMultipart(
      this.methodUrl('sendPhoto'),
      boundary,
      body,
    );
    if (!primary.ok) return primary;
    if (parts.length > 1) {
      await this.sendContinuationChunks(
        resolvedChatId,
        parts.slice(1),
        parseMode,
        primary.messageId,
      );
    }
    return primary;
  }

  public async sendVideo(
    chatId: string,
    text: string,
    videoPath: string,
    options?: TelegramPublishOptions,
  ): Promise<TelegramSendResult> {
    const resolvedChatId = this.resolveChatId(chatId);
    const missing = this.requireConfig(resolvedChatId);
    if (missing) return { ok: false, messageId: null, error: missing };
    if (!text || text.length === 0) {
      return { ok: false, messageId: null, error: 'empty message' };
    }
    if (!videoPath) {
      return { ok: false, messageId: null, error: 'empty video path' };
    }
    const fileResult = readFileWithValidation(videoPath, this.logger, 'video');
    if (fileResult.error) {
      return { ok: false, messageId: null, error: fileResult.error };
    }
    const limited = this.checkRateLimit();
    if (limited) return { ok: false, messageId: null, error: limited };
    const parseMode = options?.parseMode ?? 'Markdown';
    const supportsStreaming = options?.supportsStreaming ?? true;
    const parts = BaseBotApiAdapter.splitOverflow(
      BaseBotApiAdapter.normalizeBreaks(text),
      BaseBotApiAdapter.CAPTION_MAX_LENGTH,
      BaseBotApiAdapter.TEXT_MAX_LENGTH,
    );
    const boundary = `----feedPublisher${crypto.randomUUID().replace(/-/g, '')}`;
    const textFields: Array<[string, string]> = [
      ['chat_id', resolvedChatId],
      ['caption', parts[0]],
      ['parse_mode', parseMode],
      ...(supportsStreaming
        ? [['supports_streaming', 'true'] as [string, string]]
        : []),
      ...BaseBotApiAdapter.replyMarkupField(options),
    ];
    const body = buildMultipartBody(boundary, textFields, {
      fieldName: 'video',
      fileName: basename(videoPath),
      mimeType: guessMimeType(extname(videoPath)),
      bytes: fileResult.bytes,
    });
    const primary = await this.http.postMultipart(
      this.methodUrl('sendVideo'),
      boundary,
      body,
    );
    if (!primary.ok) return primary;
    if (parts.length > 1) {
      await this.sendContinuationChunks(
        resolvedChatId,
        parts.slice(1),
        parseMode,
        primary.messageId,
      );
    }
    return primary;
  }

  public async sendMediaGroup(
    chatId: string,
    text: string,
    imagePaths: string[],
    options?: TelegramPublishOptions,
  ): Promise<TelegramSendResult> {
    const resolvedChatId = this.resolveChatId(chatId);
    const missing = this.requireConfig(resolvedChatId);
    if (missing) return { ok: false, messageId: null, error: missing };
    if (!text || text.length === 0) {
      return { ok: false, messageId: null, error: 'empty message' };
    }
    if (!imagePaths || imagePaths.length === 0) {
      return { ok: false, messageId: null, error: 'no images' };
    }
    const filesResult = readMultipleFilesWithValidation(
      imagePaths,
      this.logger,
      'image',
    );
    if (filesResult.error) {
      return { ok: false, messageId: null, error: filesResult.error };
    }
    const limited = this.checkRateLimit();
    if (limited) return { ok: false, messageId: null, error: limited };
    const parseMode = options?.parseMode ?? 'Markdown';
    const parts = BaseBotApiAdapter.splitOverflow(
      BaseBotApiAdapter.normalizeBreaks(text),
      BaseBotApiAdapter.CAPTION_MAX_LENGTH,
      BaseBotApiAdapter.TEXT_MAX_LENGTH,
    );
    const boundary = `----feedPublisher${crypto.randomUUID().replace(/-/g, '')}`;
    const mediaArray = imagePaths.map((_, index) => {
      const item: {
        type: string;
        media: string;
        caption?: string;
        parse_mode?: string;
      } = { type: 'photo', media: `attach://photo${index}` };
      if (index === 0) {
        item.caption = parts[0];
        item.parse_mode = parseMode;
      }
      return item;
    });
    const textFields: Array<[string, string]> = [
      ['chat_id', resolvedChatId],
      ['media', JSON.stringify(mediaArray)],
      ...BaseBotApiAdapter.replyMarkupField(options),
    ];
    const files = filesResult.bytesArray.map((bytes, index) => ({
      fieldName: `photo${index}`,
      fileName: basename(imagePaths[index] as string),
      mimeType: guessMimeType(extname(imagePaths[index] as string)),
      bytes,
    }));
    const body = buildMediaGroupMultipartBody(boundary, textFields, files);
    const primary = await this.http.postMultipart(
      this.methodUrl('sendMediaGroup'),
      boundary,
      body,
    );
    if (!primary.ok) return primary;
    if (parts.length > 1) {
      await this.sendContinuationChunks(
        resolvedChatId,
        parts.slice(1),
        parseMode,
        primary.messageId,
      );
    }
    return primary;
  }

  public async getChat(
    chatId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const missing = this.requireConfig(this.resolveChatId(chatId));
    if (missing) return { ok: false, error: missing };
    if (!chatId || chatId.trim().length === 0) {
      return { ok: false, error: 'empty chat_id' };
    }
    const url = `${this.methodUrl('getChat')}?chat_id=${encodeURIComponent(chatId)}`;
    try {
      const body = await new Promise<string>((resolve, reject) => {
        const req = httpsRequest(url, { method: 'GET' }, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        });
        req.on('error', reject);
        req.end();
      });
      const data = JSON.parse(body) as {
        ok: boolean;
        description?: string;
      };
      if (data.ok) return { ok: true };
      this.logger.warn(
        `getChat failed for ${chatId}: ${data.description ?? 'unknown error'}`,
      );
      return { ok: false, error: data.description ?? 'chat not found' };
    } catch (err) {
      this.logger.warn(
        `getChat network error for ${chatId}: ${(err as Error).message}`,
      );
      return { ok: false, error: 'unreachable' };
    }
  }
}
