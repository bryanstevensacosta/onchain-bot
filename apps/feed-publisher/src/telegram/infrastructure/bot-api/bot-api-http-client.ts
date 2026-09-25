import { Injectable, Logger } from '@nestjs/common';
import { request as httpsRequest } from 'node:https';
import type { TelegramSendResult } from '../../domain/ports/telegram-publisher.port';

/**
 * Thin transport for the Telegram Bot API (moved read-only from the
 * backend `BotApiHttpClient`, Tramo 2 todo 7).
 *
 * Token-agnostic on purpose: callers pass the FULL method URL (base +
 * token + method), so one singleton serves both the crypto and the
 * threads bot. JSON POST (`sendMessage`) + multipart POST (`sendPhoto`,
 * `sendVideo`, `sendMediaGroup`) over Node's built-in `https` — no
 * extra dependency.
 */
@Injectable()
export class BotApiHttpClient {
  private readonly logger = new Logger(BotApiHttpClient.name);

  public async postJson(
    url: string,
    payload: Record<string, unknown>,
  ): Promise<TelegramSendResult> {
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
          res.on('end', () =>
            resolve(
              BotApiHttpClient.parseSingle(
                url,
                Buffer.concat(chunks).toString('utf8'),
                this.logger,
              ),
            ),
          );
        },
      );
      req.on('error', (err) => {
        this.logger.error(`HTTPS request failed: ${err.message}`);
        resolve({ ok: false, messageId: null, error: err.message });
      });
      req.write(body);
      req.end();
    });
  }

  public async postMultipart(
    url: string,
    boundary: string,
    body: Buffer,
  ): Promise<TelegramSendResult> {
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
          res.on('end', () =>
            resolve(
              BotApiHttpClient.parseMultipart(
                url,
                Buffer.concat(chunks).toString('utf8'),
                this.logger,
              ),
            ),
          );
        },
      );
      req.on('error', (err) => {
        this.logger.error(`multipart HTTPS request failed: ${err.message}`);
        resolve({ ok: false, messageId: null, error: err.message });
      });
      req.write(body);
      req.end();
    });
  }

  private static parseSingle(
    url: string,
    raw: string,
    logger: Logger,
  ): TelegramSendResult {
    try {
      const data = JSON.parse(raw) as {
        ok: boolean;
        result?: { message_id: number };
        description?: string;
      };
      if (data.ok && data.result) {
        return { ok: true, messageId: data.result.message_id, error: null };
      }
      return {
        ok: false,
        messageId: null,
        error: data.description ?? 'unknown error',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'invalid response';
      logger.error(`failed to parse response from ${url}: ${message}`);
      return { ok: false, messageId: null, error: message };
    }
  }

  private static parseMultipart(
    url: string,
    raw: string,
    logger: Logger,
  ): TelegramSendResult {
    try {
      const data = JSON.parse(raw) as {
        ok: boolean;
        result?: { message_id: number } | Array<{ message_id: number }>;
        description?: string;
      };
      if (data.ok && data.result) {
        const first = Array.isArray(data.result)
          ? (data.result[0]?.message_id ?? null)
          : data.result.message_id;
        return { ok: true, messageId: first, error: null };
      }
      logger.error(
        `Telegram API error for ${url}: ${data.description ?? 'unknown error'}`,
      );
      return {
        ok: false,
        messageId: null,
        error: data.description ?? 'unknown error',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'invalid response';
      logger.error(`failed to parse multipart response: ${message}`);
      return { ok: false, messageId: null, error: message };
    }
  }
}
