import { Logger } from '@nestjs/common';
import { request as httpsRequest } from 'node:https';
import type { SendResult } from 'telegram/shared';

/**
 * Lightweight HTTP client for the Telegram Bot API.
 *
 * Handles JSON POST (`sendMessage`) and multipart/form-data POST
 * (`sendPhoto`, `sendVideo`, `sendMediaGroup`) using Node's built-in
 * `https` module — no external HTTP client dependency needed.
 *
 * Composed manually by `BotApiCryptoNewsPublisherAdapter` (not @Injectable).
 */
export class BotApiHttpClient {
  constructor(
    private readonly logger: Logger,
    private readonly apiBase: string,
    private readonly botToken: string,
    private readonly outputChannel: string,
  ) {}

  async postJson(
    method: string,
    payload: Record<string, unknown>,
  ): Promise<SendResult> {
    const url = `${this.apiBase}${this.botToken}/${method}`;
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

  async postMultipart(
    method: string,
    boundary: string,
    body: Buffer,
  ): Promise<SendResult> {
    const url = `${this.apiBase}${this.botToken}/${method}`;
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

  async postMultipartMediaGroup(
    method: string,
    boundary: string,
    body: Buffer,
  ): Promise<SendResult> {
    const url = `${this.apiBase}${this.botToken}/${method}`;
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
                result?: Array<{ message_id: number }>;
                description?: string;
              };
              if (data.ok && data.result && data.result.length > 0) {
                const messageId = data.result[0]?.message_id ?? null;
                this.logger.log(
                  `Sent media group to ${this.outputChannel}, first message_id: ${messageId}`,
                );
                resolve({
                  ok: true,
                  messageId,
                  error: null,
                });
              } else {
                this.logger.error(
                  `Telegram sendMediaGroup API error: ${data.description ?? 'unknown error'}`,
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
                `failed to parse sendMediaGroup response: ${message}`,
              );
              resolve({ ok: false, messageId: null, error: message });
            }
          });
        },
      );
      req.on('error', (err) => {
        this.logger.error(
          `sendMediaGroup HTTPS request failed: ${err.message}`,
        );
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
