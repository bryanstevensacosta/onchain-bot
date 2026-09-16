import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  TelegramPublisherPort,
  type SendResult,
  type TelegramPublishOptions,
} from 'telegram/shared';
import { formatUrlsAsMarkdown } from 'shared/common/utils/telegram-url-formatter';
import { sanitizeTelegramHtml } from 'shared/common/utils/telegram-html-sanitizer';
import { basename, extname } from 'node:path';
import { request as httpsRequest } from 'node:https';
import {
  buildMultipartBody,
  buildMediaGroupMultipartBody,
} from './build-multipart-body';
import { BotApiHttpClient } from './bot-api-http-client';
import { guessMimeType } from './guess-mime-type';
import {
  readFileWithValidation,
  readMultipleFilesWithValidation,
} from './telegram-file-utils';

interface AppConfigShape {
  readonly publishing: {
    readonly cryptoNews: {
      readonly botToken: string;
      readonly outputChannel: string;
    };
  };
}

/**
 * Bot API publisher adapter for the crypto-news flow.
 *
 * Implements `TelegramPublisherPort` against the configured
 * `app.publishing.cryptoNews.{botToken, outputChannel}` (distinct from
 * vip-calls — separate token + channel). Two methods:
 *
 * - `sendMessage`: plain text (or text + remote URL photo). Same JSON
 *   shape as Telegram Bot API.
 * - `sendPhoto`: text + LOCAL file path. We read the file from disk
 *   and `POST` it to the Bot API's `sendPhoto` endpoint as
 *   `multipart/form-data` (constructed manually — no new deps).
 * - `sendVideo`: same pattern as `sendPhoto`, but POSTs to `sendVideo`
 *   with `supports_streaming: true`.
 *
 * The default output channel is read from config (the `chatId`
 * argument is ignored); crypto-news always publishes to one channel.
 */
@Injectable()
export class BotApiCryptoNewsPublisherAdapter extends TelegramPublisherPort {
  private readonly logger = new Logger(BotApiCryptoNewsPublisherAdapter.name);
  private static readonly API_BASE = 'https://api.telegram.org/bot';
  private static readonly CAPTION_MAX_LENGTH = 1024;
  private static readonly TEXT_MAX_LENGTH = 4096;

  private readonly botToken: string;
  private readonly outputChannel: string;
  private readonly httpClient: BotApiHttpClient;

  public constructor(private readonly configService: ConfigService) {
    super();
    const cfg = this.configService.get<AppConfigShape>('app');
    const token = cfg?.publishing?.cryptoNews?.botToken ?? '';
    const channel = cfg?.publishing?.cryptoNews?.outputChannel ?? '';
    // Read eagerly from config but do NOT throw if missing. The adapter
    // would otherwise crash the module at boot when the env vars are
    // absent (e.g. tests, fresh installs). Each send method validates
    // at call time and returns a structured error — this lets the cron
    // log a warning and skip gracefully instead of the whole process
    // refusing to start.
    this.botToken = token;
    this.outputChannel = channel;
    this.httpClient = new BotApiHttpClient(
      this.logger,
      BotApiCryptoNewsPublisherAdapter.API_BASE,
      this.botToken,
      this.outputChannel,
    );
    if (!token || !channel) {
      this.logger.warn(
        `BotApiCryptoNewsPublisherAdapter not fully configured ` +
          `(botToken=${token ? 'set' : 'EMPTY'}, ` +
          `outputChannel=${channel ? 'set' : 'EMPTY'}) — ` +
          `sendMessage/sendPhoto will return ok=false until configured.`,
      );
    }
  }

  /**
   * Resolve the destination chat. An explicit `chatId` (the DB-backed
   * `LlmConfig.targetChannel` the use cases pass) always wins; an empty
   * one falls back to the env default (`CRYPTO_NEWS_OUTPUT_CHANNEL`,
   * which is what the ads path relies on).
   */
  private resolveChatId(chatId: string): string {
    return chatId?.trim() ? chatId : this.outputChannel;
  }

  /**
   * Returns a not-configured error when the bot token is missing or
   * neither an explicit chat id nor the env default resolves to one.
   * Centralised so all send methods share the same fallback path.
   */
  private requireConfig(chatId = ''): { ok: false; reason: string } | null {
    if (!this.botToken || !chatId) {
      return {
        ok: false,
        reason:
          `BotApiCryptoNewsPublisherAdapter: ` +
          `missing ${!this.botToken ? 'CRYPTO_NEWS_BOT_TOKEN' : ''}` +
          `${!this.botToken && !chatId ? ' and ' : ''}` +
          `${!chatId ? 'targetChannel/CRYPTO_NEWS_OUTPUT_CHANNEL' : ''}`,
      };
    }
    return null;
  }

  /**
   * Normalize line breaks for readability: the LLM emits single `\n`
   * (cramped posts), Telegram renders blank lines from `\n\n`. Collapse
   * runs of 3+ into exactly two, then double the remaining singles.
   * Runs on the formatted text so it applies to caption + continuations.
   */
  private static normalizeBreaks(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/(?<!\n)\n(?!\n)/g, '\n\n');
  }

  /**
   * Split `text` at a safe boundary within `max` chars. Picks the LAST
   * block boundary (paragraph or bullet start) in budget so captions fill
   * without ever cutting a bullet mid-sentence — filling is secondary to
   * not breaking. Falls back to a trailing space, then a hard cut (only
   * unavoidable when a single block exceeds the limit). Telegram HTML
   * entities stay intact: a hard cut inside a tag would 400 the chunk.
   * Returns [head, tail, clean] where clean tells whether the split fell
   * on a block boundary (no ellipsis needed) vs mid-block (ellipsis).
   * Leading blank whitespace is trimmed from tail.
   */
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

  /**
   * Split `text` into a first chunk of at most `firstMax` chars plus
   * continuation chunks of at most `restMax`. A trailing '…' is added to
   * the first chunk ONLY when it was cut mid-block; clean block splits
   * need no marker. Short texts behave exactly as before (single part).
   */
  private static splitOverflow(
    text: string,
    firstMax: number,
    restMax: number,
  ): string[] {
    if (text.length <= firstMax) return [text];
    const parts: string[] = [];
    // Budget firstMax - 1 so head + '…' still fits firstMax. Trailing
    // blank lines are trimmed before the ellipsis (ugly '…\n…' otherwise).
    const [head, firstTail, clean] =
      BotApiCryptoNewsPublisherAdapter.splitAtBoundary(text, firstMax - 1);
    parts.push(
      clean ? head.replace(/\s+$/, '') : head.replace(/\s+$/, '') + '…',
    );
    let tail = firstTail;
    while (tail.length > restMax) {
      const [next, rest] = BotApiCryptoNewsPublisherAdapter.splitAtBoundary(
        tail,
        restMax,
      );
      parts.push(next);
      tail = rest;
    }
    if (tail.length > 0) parts.push(tail);
    return parts;
  }

  /**
   * Post one plain-text chunk (no reply markup — only the primary message
   * carries buttons). When `replyToMessageId` is set, the chunk is sent as
   * a reply so continuations thread under the original post.
   */
  private async postTextChunk(
    chatId: string,
    text: string,
    parseMode: 'Markdown' | 'HTML',
    replyToMessageId?: number,
  ): Promise<SendResult> {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: false,
    };
    if (replyToMessageId !== undefined) {
      payload.reply_to_message_id = replyToMessageId;
    }
    return this.httpClient.postJson('sendMessage', payload);
  }

  /**
   * Send continuation chunks as replies to the primary message, so the full
   * post reads as one thread. A failed follow-up only warns: the primary is
   * already posted, and failing the whole publish would re-post it on retry
   * (duplicate spam > truncated tail).
   */
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

  /**
   * Format `text` for the requested parse mode. `'HTML'` runs the
   * sanitizer (allowlist + href validation + raw-URL wrapping);
   * `'Markdown'` keeps the existing `formatUrlsAsMarkdown` flow.
   */
  private formatForParseMode(
    text: string,
    parseMode: 'Markdown' | 'HTML',
  ): string {
    return parseMode === 'HTML'
      ? sanitizeTelegramHtml(text)
      : formatUrlsAsMarkdown(text);
  }

  /**
   * Send a plain text message (optionally with a remote image URL).
   * Delegates to the Telegram Bot API via Node's https module.
   * Text beyond TEXT_MAX_LENGTH used to be silently dropped; now the
   * remainder follows as continuation message(s).
   */
  public async sendMessage(
    chatId: string,
    text: string,
    imageUrl?: string,
    options?: TelegramPublishOptions,
  ): Promise<SendResult> {
    const resolvedChatId = this.resolveChatId(chatId);
    const missing = this.requireConfig(resolvedChatId);
    if (missing) return { ok: false, messageId: null, error: missing.reason };
    if (!text || text.length === 0) {
      return { ok: false, messageId: null, error: 'empty message' };
    }
    const parseMode = options?.parseMode ?? 'Markdown';
    const formattedText = BotApiCryptoNewsPublisherAdapter.normalizeBreaks(
      this.formatForParseMode(text, parseMode),
    );
    const parts = BotApiCryptoNewsPublisherAdapter.splitOverflow(
      formattedText,
      BotApiCryptoNewsPublisherAdapter.TEXT_MAX_LENGTH,
      BotApiCryptoNewsPublisherAdapter.TEXT_MAX_LENGTH,
    );
    const payload: Record<string, unknown> = {
      chat_id: resolvedChatId,
      text: parts[0],
      parse_mode: parseMode,
      disable_web_page_preview: false,
    };
    if (imageUrl) {
      payload.photo = imageUrl;
    }
    if (options?.replyMarkup) {
      payload.reply_markup = { inline_keyboard: options.replyMarkup };
    }
    const primary = await this.httpClient.postJson('sendMessage', payload);
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

  /**
   * Send a caption + photo from a LOCAL file path. Telegram Bot API
   * accepts multipart/form-data on the `sendPhoto` endpoint.
   *
   * We construct the multipart body manually with Node's
   * `node:https` so we don't pull in another HTTP client (the project
   * already has `@nestjs/axios`, but axios does not accept streamed
   * multipart cleanly without `form-data`).
   */
  public async sendPhoto(
    chatId: string,
    text: string,
    imagePath: string,
    options?: TelegramPublishOptions,
  ): Promise<SendResult> {
    const resolvedChatId = this.resolveChatId(chatId);
    const missing = this.requireConfig(resolvedChatId);
    if (missing) return { ok: false, messageId: null, error: missing.reason };
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
    const fileBytes = fileResult.bytes;

    const parseMode = options?.parseMode ?? 'Markdown';
    const formattedText = BotApiCryptoNewsPublisherAdapter.normalizeBreaks(
      this.formatForParseMode(text, parseMode),
    );
    // Caption hard limit is 1024; the remainder follows as continuation
    // message(s) instead of being silently dropped (used to truncate here).
    const parts = BotApiCryptoNewsPublisherAdapter.splitOverflow(
      formattedText,
      BotApiCryptoNewsPublisherAdapter.CAPTION_MAX_LENGTH,
      BotApiCryptoNewsPublisherAdapter.TEXT_MAX_LENGTH,
    );
    const caption = parts[0];

    const boundary = `----cryptoNews${crypto.randomUUID().replace(/-/g, '')}`;
    const fileName = basename(imagePath);
    const mimeType = guessMimeType(extname(imagePath));

    const textFields: Array<[string, string]> = [
      ['chat_id', resolvedChatId],
      ['caption', caption],
      ['parse_mode', parseMode],
    ];
    if (options?.replyMarkup) {
      textFields.push([
        'reply_markup',
        JSON.stringify({ inline_keyboard: options.replyMarkup }),
      ]);
    }

    const body = buildMultipartBody(boundary, textFields, {
      fieldName: 'photo',
      fileName,
      mimeType,
      bytes: fileBytes,
    });

    const primary = await this.httpClient.postMultipart(
      'sendPhoto',
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
  ): Promise<SendResult> {
    const resolvedChatId = this.resolveChatId(chatId);
    const missing = this.requireConfig(resolvedChatId);
    if (missing) return { ok: false, messageId: null, error: missing.reason };
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
    const fileBytes = fileResult.bytes;

    const parseMode = options?.parseMode ?? 'Markdown';
    const supportsStreaming = options?.supportsStreaming ?? true;
    const formattedText = BotApiCryptoNewsPublisherAdapter.normalizeBreaks(
      this.formatForParseMode(text, parseMode),
    );
    // Same caption limit + continuation policy as sendPhoto.
    const parts = BotApiCryptoNewsPublisherAdapter.splitOverflow(
      formattedText,
      BotApiCryptoNewsPublisherAdapter.CAPTION_MAX_LENGTH,
      BotApiCryptoNewsPublisherAdapter.TEXT_MAX_LENGTH,
    );
    const caption = parts[0];

    const boundary = `----cryptoNews${crypto.randomUUID().replace(/-/g, '')}`;
    const fileName = basename(videoPath);
    const mimeType = guessMimeType(extname(videoPath));

    const textFields: Array<[string, string]> = [
      ['chat_id', resolvedChatId],
      ['caption', caption],
      ['parse_mode', parseMode],
    ];
    if (supportsStreaming) {
      textFields.push(['supports_streaming', 'true']);
    }
    if (options?.replyMarkup) {
      textFields.push([
        'reply_markup',
        JSON.stringify({ inline_keyboard: options.replyMarkup }),
      ]);
    }

    const body = buildMultipartBody(boundary, textFields, {
      fieldName: 'video',
      fileName,
      mimeType,
      bytes: fileBytes,
    });

    const primary = await this.httpClient.postMultipart(
      'sendVideo',
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
  ): Promise<SendResult> {
    const resolvedChatId = this.resolveChatId(chatId);
    const missing = this.requireConfig(resolvedChatId);
    if (missing) return { ok: false, messageId: null, error: missing.reason };

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
    const fileBytesArray = filesResult.bytesArray;

    const parseMode = options?.parseMode ?? 'Markdown';
    const formattedText = BotApiCryptoNewsPublisherAdapter.normalizeBreaks(
      this.formatForParseMode(text, parseMode),
    );
    // Album caption lives on the first item (same 1024 limit); overflow
    // follows as continuation message(s).
    const parts = BotApiCryptoNewsPublisherAdapter.splitOverflow(
      formattedText,
      BotApiCryptoNewsPublisherAdapter.CAPTION_MAX_LENGTH,
      BotApiCryptoNewsPublisherAdapter.TEXT_MAX_LENGTH,
    );
    const caption = parts[0];

    const boundary = `----cryptoNews${crypto.randomUUID().replace(/-/g, '')}`;

    const mediaArray = imagePaths.map((_path, index) => {
      const mediaItem: {
        type: string;
        media: string;
        caption?: string;
        parse_mode?: string;
      } = {
        type: 'photo',
        media: `attach://photo${index}`,
      };
      if (index === 0) {
        mediaItem.caption = caption;
        mediaItem.parse_mode = parseMode;
      }
      return mediaItem;
    });

    const textFields: Array<[string, string]> = [
      ['chat_id', resolvedChatId],
      ['media', JSON.stringify(mediaArray)],
    ];
    if (options?.replyMarkup) {
      textFields.push([
        'reply_markup',
        JSON.stringify({ inline_keyboard: options.replyMarkup }),
      ]);
    }

    const files = fileBytesArray.map((bytes, index) => ({
      fieldName: `photo${index}`,
      fileName: basename(imagePaths[index]),
      mimeType: guessMimeType(extname(imagePaths[index])),
      bytes,
    }));

    const body = buildMediaGroupMultipartBody(boundary, textFields, files);

    const primary = await this.httpClient.postMultipartMediaGroup(
      'sendMediaGroup',
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

  /**
   * Call Telegram's `getChat` endpoint to verify a chat exists and the
   * bot can access it. Makes a GET request to the Bot API.
   *
   * Network errors (timeout, DNS failure) log a warning and return
   * `{ ok: false, error: 'unreachable' }` so callers can distinguish
   * "chat not found" from "cannot reach Telegram".
   */
  public async getChat(
    chatId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const missing = this.requireConfig();
    if (missing) return missing;
    if (!chatId || chatId.trim().length === 0) {
      return { ok: false, error: 'empty chat_id' };
    }
    const url = `${BotApiCryptoNewsPublisherAdapter.API_BASE}${this.botToken}/getChat?chat_id=${encodeURIComponent(chatId)}`;
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
