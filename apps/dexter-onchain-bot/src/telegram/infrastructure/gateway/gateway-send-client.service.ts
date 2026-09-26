import { Injectable, Optional } from '@nestjs/common';
import {
  BotsGatewaySenderPort,
  type DexterGatewaySendInput,
  type DexterGatewaySendResult,
} from '../../domain/ports/bots-gateway-sender.port';
import { DexterBotConfigService } from '../../../settings/infrastructure/config/bot.config';
import { GatewayHmacSigner } from './gateway-hmac-signer.service';

/**
 * Gateway-backed Bot API sender (telegram-bots-gateway todo 6).
 *
 * Chunking mirrors the direct `TelegramBotClient` (4096-char messages)
 * so dual-send parity compares like-for-like. Each chunk is one gateway
 * `POST /api/bots/:id/send` (`message`, `parse_mode` passed through,
 * `client_msg_id` suffixed per chunk for idempotency). Keyboard shapes
 * (`reply_markup`) have NO gateway equivalent (`SendDto` carries no
 * `reply_markup`) — fail closed so callers record the leg as skipped,
 * never silently keyboard-less. The plaintext token never appears here —
 * only the vault `botId` travels (the gateway decrypts server-side).
 * Fail-closed: auth, upstream and transport failures return
 * `{ ok: false }`. Uses global `fetch` (no axios here).
 */
@Injectable()
export class GatewaySendClient extends BotsGatewaySenderPort {
  private static readonly MAX_LENGTH = 4096;
  private static readonly TIMEOUT_MS = 10_000;

  public constructor(
    @Optional() private readonly botConfig?: DexterBotConfigService,
    @Optional() private readonly signer?: GatewayHmacSigner,
  ) {
    super();
  }

  public async sendViaGateway(
    input: DexterGatewaySendInput,
  ): Promise<DexterGatewaySendResult> {
    if (!input.text || input.text.length === 0) {
      return { ok: false, messageId: null, error: 'empty message' };
    }
    if (input.replyMarkup) {
      return {
        ok: false,
        messageId: null,
        error: 'gateway: reply_markup not supported (direct-only shape)',
      };
    }
    try {
      let lastMessageId: number | null = null;
      const chunks = GatewaySendClient.splitMessage(input.text);
      for (let i = 0; i < chunks.length; i += 1) {
        const result = await this.post(input, {
          kind: 'message',
          chat_id: input.chatId,
          text: chunks[i],
          parse_mode: input.parseMode ?? 'Markdown',
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
        this.botConfig?.get().botsGatewayBaseUrl ?? 'http://localhost:4070';
      return raw.replace(/\/+$/, '') || 'http://localhost:4070';
    } catch {
      return 'http://localhost:4070';
    }
  }

  private async post(
    input: DexterGatewaySendInput,
    dto: Record<string, unknown>,
  ): Promise<DexterGatewaySendResult> {
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
