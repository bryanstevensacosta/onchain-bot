import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TelegramPublisherPort, type SendResult } from 'telegram/shared';
import { readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { request as httpsRequest } from 'node:https';

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
 *
 * The default output channel is read from config (the `chatId`
 * argument is ignored); crypto-news always publishes to one channel.
 */
@Injectable()
export class BotApiCryptoNewsPublisherAdapter extends TelegramPublisherPort {
  private readonly logger = new Logger(BotApiCryptoNewsPublisherAdapter.name);
  private static readonly API_BASE = 'https://api.telegram.org/bot';
  private static readonly CAPTION_MAX_LENGTH = 1024;

  private readonly botToken: string;
  private readonly outputChannel: string;

  public constructor(private readonly configService: ConfigService) {
    super();
    this.botToken = this.resolveBotToken();
    this.outputChannel = this.resolveOutputChannel();
  }

  private resolveBotToken(): string {
    const cfg = this.configService.get<AppConfigShape>('app');
    const token = cfg?.publishing?.cryptoNews?.botToken;
    if (!token) {
      this.logger.error('CRYPTO_NEWS_BOT_TOKEN not configured');
      throw new Error('CRYPTO_NEWS_BOT_TOKEN not configured');
    }
    return token;
  }

  private resolveOutputChannel(): string {
    const cfg = this.configService.get<AppConfigShape>('app');
    const channel = cfg?.publishing?.cryptoNews?.outputChannel;
    if (!channel) {
      this.logger.error('CRYPTO_NEWS_OUTPUT_CHANNEL not configured');
      throw new Error('CRYPTO_NEWS_OUTPUT_CHANNEL not configured');
    }
    return channel;
  }

  /**
   * Send a plain text message (optionally with a remote image URL).
   * Delegates to the Telegram Bot API via Node's https module.
   */
  public async sendMessage(
    _chatId: string,
    text: string,
    imageUrl?: string,
  ): Promise<SendResult> {
    if (!text || text.length === 0) {
      return { ok: false, messageId: null, error: 'empty message' };
    }
    const payload: Record<string, unknown> = {
      chat_id: this.outputChannel,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: false,
    };
    if (imageUrl) {
      payload.photo = imageUrl;
    }
    return this.postJson('sendMessage', payload);
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
    _chatId: string,
    text: string,
    imagePath: string,
  ): Promise<SendResult> {
    if (!text || text.length === 0) {
      return { ok: false, messageId: null, error: 'empty message' };
    }
    if (!imagePath) {
      return { ok: false, messageId: null, error: 'empty image path' };
    }
    let fileBytes: Buffer;
    try {
      const stats = statSync(imagePath);
      if (!stats.isFile()) {
        return {
          ok: false,
          messageId: null,
          error: `not a file: ${imagePath}`,
        };
      }
      fileBytes = readFileSync(imagePath);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(`failed to read photo at ${imagePath}: ${message}`);
      return { ok: false, messageId: null, error: message };
    }

    const caption =
      text.length <= BotApiCryptoNewsPublisherAdapter.CAPTION_MAX_LENGTH
        ? text
        : text.slice(
            0,
            BotApiCryptoNewsPublisherAdapter.CAPTION_MAX_LENGTH - 1,
          ) + '…';

    const boundary = `----cryptoNews${crypto.randomUUID().replace(/-/g, '')}`;
    const fileName = basename(imagePath);
    const mimeType = guessMimeType(extname(imagePath));

    const textFields: Array<[string, string]> = [
      ['chat_id', this.outputChannel],
      ['caption', caption],
      ['parse_mode', 'Markdown'],
    ];

    const body = buildMultipartBody(boundary, textFields, {
      fieldName: 'photo',
      fileName,
      mimeType,
      bytes: fileBytes,
    });

    return this.postMultipart('sendPhoto', boundary, body);
  }

  private async postJson(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<SendResult> {
    const url = `${BotApiCryptoNewsPublisherAdapter.API_BASE}${this.botToken}/${method}`;
    const body = JSON.stringify(payload);
    return new Promise((resolve) => {
      const req = httpsRequest(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            try {
              const data = JSON.parse(raw) as {
                ok: boolean;
                result?: { message_id: number };
                description?: string;
              };
              if (data.ok && data.result) {
                resolve({
                  ok: true,
                  messageId: data.result.message_id,
                  error: null,
                });
              } else {
                resolve({
                  ok: false,
                  messageId: null,
                  error: data.description ?? 'unknown error',
                });
              }
            } catch (err) {
              const message =
                err instanceof Error ? err.message : 'invalid response';
              this.logger.error(`failed to parse response: ${message}`);
              resolve({ ok: false, messageId: null, error: message });
            }
          });
        },
      );
      req.on('error', (err) => {
        this.logger.error(`HTTPS request failed: ${err.message}`);
        resolve({
          ok: false,
          messageId: null,
          error: err.message,
        });
      });
      req.write(body);
      req.end();
    });
  }

  private async postMultipart(
    method: string,
    boundary: string,
    body: Buffer,
  ): Promise<SendResult> {
    const url = `${BotApiCryptoNewsPublisherAdapter.API_BASE}${this.botToken}/${method}`;
    return new Promise((resolve) => {
      const req = httpsRequest(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Content-Length': body.length,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            try {
              const data = JSON.parse(raw) as {
                ok: boolean;
                result?: { message_id: number };
                description?: string;
              };
              if (data.ok && data.result) {
                this.logger.log(
                  `Sent photo to ${this.outputChannel}, message_id: ${data.result.message_id}`,
                );
                resolve({
                  ok: true,
                  messageId: data.result.message_id,
                  error: null,
                });
              } else {
                this.logger.error(
                  `Telegram sendPhoto API error: ${data.description ?? 'unknown error'}`,
                );
                resolve({
                  ok: false,
                  messageId: null,
                  error: data.description ?? 'unknown error',
                });
              }
            } catch (err) {
              const message =
                err instanceof Error ? err.message : 'invalid response';
              this.logger.error(
                `failed to parse sendPhoto response: ${message}`,
              );
              resolve({ ok: false, messageId: null, error: message });
            }
          });
        },
      );
      req.on('error', (err) => {
        this.logger.error(`sendPhoto HTTPS request failed: ${err.message}`);
        resolve({
          ok: false,
          messageId: null,
          error: err.message,
        });
      });
      req.write(body);
      req.end();
    });
  }
}

/**
 * Build a multipart/form-data body that contains the supplied text
 * fields followed by one binary file part. Pure function — exported
 * for testing.
 */
export function buildMultipartBody(
  boundary: string,
  textFields: ReadonlyArray<readonly [string, string]>,
  file: {
    fieldName: string;
    fileName: string;
    mimeType: string;
    bytes: Buffer;
  },
): Buffer {
  const parts: Buffer[] = [];
  const CRLF = '\r\n';

  for (const [name, value] of textFields) {
    parts.push(
      Buffer.from(
        `--${boundary}${CRLF}` +
          `Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}` +
          `${value}${CRLF}`,
      ),
    );
  }

  parts.push(
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"${CRLF}` +
        `Content-Type: ${file.mimeType}${CRLF}${CRLF}`,
    ),
  );
  parts.push(file.bytes);
  parts.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));

  return Buffer.concat(parts);
}

/**
 * Best-effort MIME-type inference from a file extension. Telegram's
 * `sendPhoto` accepts JPEG/PNG/GIF/WebP; anything else falls back to
 * `application/octet-stream` which Telegram still accepts for most
 * common photo formats (it sniffs magic bytes server-side).
 */
function guessMimeType(ext: string): string {
  const normalized = ext.toLowerCase();
  switch (normalized) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}
