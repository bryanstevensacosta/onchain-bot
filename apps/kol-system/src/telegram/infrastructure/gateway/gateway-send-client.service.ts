import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BotsGatewaySenderPort,
  type GatewaySendInput,
} from '../../domain/ports/bots-gateway-sender.port';
import type { SendResult } from '../../domain/ports/telegram-publisher.port';
import type { TelegramConfig } from '../../../shared/config/telegram.config';
import { GatewayHmacSigner } from './gateway-hmac-signer.service';

/**
 * Gateway-backed Bot API sender (telegram-bots-gateway todo 4).
 *
 * Chunking mirrors `MultiBotPublisherAdapter` exactly (4096-char
 * messages, photo + 1024-char caption + overflow chunks) so dual-send
 * parity compares like-for-like. Each chunk is one gateway
 * `POST /api/bots/:id/send` (`message` or `photo`, `parse_mode:
 * Markdown`, `client_msg_id` suffixed per chunk for idempotency).
 * The plaintext token never appears here — only the vault `botId`
 * travels (the gateway decrypts server-side). Fail-closed: auth,
 * upstream and transport failures return `{ ok: false }`.
 * Uses global `fetch` (no axios in this app).
 */
@Injectable()
export class GatewaySendClient extends BotsGatewaySenderPort {
  private static readonly MAX_LENGTH = 4096;
  private static readonly CAPTION_MAX_LENGTH = 1024;
  private static readonly TIMEOUT_MS = 10_000;

  public constructor(
    @Optional() private readonly config?: ConfigService,
    @Optional() private readonly signer?: GatewayHmacSigner,
  ) {
    super();
  }

  public async sendViaGateway(input: GatewaySendInput): Promise<SendResult> {
    if (!input.text || input.text.length === 0) {
      return { ok: false, messageId: null, error: 'empty message' };
    }
    try {
      if (input.imageUrl) {
        return await this.sendWithPhoto(input);
      }
      let lastMessageId: number | null = null;
      const chunks = GatewaySendClient.splitMessage(input.text);
      for (let i = 0; i < chunks.length; i += 1) {
        const result = await this.post(input, {
          kind: 'message',
          chat_id: input.chatId,
          text: chunks[i],
          parse_mode: 'Markdown',
          ...(input.clientMsgId
            ? {
                client_msg_id:
                  chunks.length === 1
                    ? input.clientMsgId
                    : `${input.clientMsgId}:chunk:${i}`,
              }
            : {}),
        });
        if (!result.ok) return result;
        lastMessageId = result.messageId;
      }
      return { ok: true, messageId: lastMessageId, error: null };
    } catch (err) {
      return {
        ok: false,
        messageId: null,
        error: err instanceof Error ? err.message : 'unknown error',
      };
    }
  }

  private async sendWithPhoto(input: GatewaySendInput): Promise<SendResult> {
    const caption =
      input.text.length <= GatewaySendClient.CAPTION_MAX_LENGTH
        ? input.text
        : input.text.slice(0, GatewaySendClient.CAPTION_MAX_LENGTH - 1) + '…';
    const photoResult = await this.post(input, {
      kind: 'photo',
      chat_id: input.chatId,
      photo: input.imageUrl,
      caption,
      parse_mode: 'Markdown',
      ...(input.clientMsgId
        ? { client_msg_id: `${input.clientMsgId}:photo` }
        : {}),
    });
    if (!photoResult.ok) return photoResult;
    let lastMessageId = photoResult.messageId;
    if (input.text.length > GatewaySendClient.CAPTION_MAX_LENGTH) {
      const remaining = input.text.slice(
        GatewaySendClient.CAPTION_MAX_LENGTH - 1,
      );
      const chunks = GatewaySendClient.splitMessage(remaining);
      for (let i = 0; i < chunks.length; i += 1) {
        const result = await this.post(input, {
          kind: 'message',
          chat_id: input.chatId,
          text: chunks[i],
          parse_mode: 'Markdown',
          ...(input.clientMsgId
            ? { client_msg_id: `${input.clientMsgId}:overflow:${i}` }
            : {}),
        });
        if (!result.ok) return result;
        lastMessageId = result.messageId;
      }
    }
    return { ok: true, messageId: lastMessageId, error: null };
  }

  private static splitMessage(text: string): string[] {
    if (text.length <= GatewaySendClient.MAX_LENGTH) return [text];
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += GatewaySendClient.MAX_LENGTH) {
      chunks.push(text.slice(i, i + GatewaySendClient.MAX_LENGTH));
    }
    return chunks;
  }

  private baseUrl(): string {
    try {
      const raw =
        this.config?.get<TelegramConfig>('telegram')?.botsGateway?.baseUrl ??
        'http://localhost:4070';
      return raw.replace(/\/+$/, '') || 'http://localhost:4070';
    } catch {
      return 'http://localhost:4070';
    }
  }

  private async post(
    input: GatewaySendInput,
    dto: Record<string, unknown>,
  ): Promise<SendResult> {
    const rawBody = JSON.stringify(dto);
    const path = `/api/bots/${encodeURIComponent(input.botId)}/send`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      ...this.signer?.authHeaders('POST', path, rawBody),
    };
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      GatewaySendClient.TIMEOUT_MS,
    );
    try {
      const res = await fetch(`${this.baseUrl()}${path}`, {
        method: 'POST',
        headers,
        body: rawBody,
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message_id?: unknown;
        message?: unknown;
        error?: unknown;
      } | null;
      if (res.ok && json?.ok === true) {
        const messageId =
          typeof json.message_id === 'number' ? json.message_id : null;
        if (messageId === null) {
          return {
            ok: false,
            messageId: null,
            error: 'gateway send returned no message_id',
          };
        }
        return { ok: true, messageId, error: null };
      }
      const detail =
        typeof json?.message === 'string'
          ? json.message
          : typeof json?.error === 'string'
            ? json.error
            : `gateway send failed (http ${res.status})`;
      return { ok: false, messageId: null, error: detail };
    } finally {
      clearTimeout(timer);
    }
  }
}
