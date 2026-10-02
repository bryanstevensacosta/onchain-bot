import type { InlineKeyboardMarkup } from './telegram.port';

export interface DexterGatewaySendInput {
  /** Gateway vault id (mapped from the local `dexter` label, never a token). */
  readonly botId: string;
  readonly chatId: string;
  readonly text: string;
  readonly parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  /**
   * Keyboards have NO gateway equivalent (`SendDto` carries no
   * `reply_markup`) — the send client fails closed and callers record
   * the leg as skipped (direct-only until gateway todo 7).
   */
  readonly replyMarkup?: InlineKeyboardMarkup;
  /** Idempotency key forwarded as `client_msg_id`. */
  readonly clientMsgId?: string;
}

export interface DexterGatewaySendResult {
  readonly ok: boolean;
  readonly messageId: number | null;
  readonly error: string | null;
}

/**
 * Gateway-backed Bot API sender (telegram-bots-gateway todo 6).
 *
 * Divergence from the direct `TelegramBotClient`: the token NEVER
 * crosses this port — the gateway resolves it from its own vault
 * (`bot_vault`) by `botId`. Requests are HMAC-signed (`x-api-key` +
 * `x-timestamp` + `x-nonce` + `x-signature`, gateway todo 2 auth).
 * Fail-closed: gateway 401/403/429-persisted/transport errors surface
 * as `{ ok: false, error }`, never a throw for expected failures.
 */
export abstract class BotsGatewaySenderPort {
  public abstract sendViaGateway(
    input: DexterGatewaySendInput,
  ): Promise<DexterGatewaySendResult>;
}
