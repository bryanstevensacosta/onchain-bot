import type { TelegramSendResult } from './telegram-publisher.port';
import type { TelegramInlineKeyboard } from './message-format.types';

export type GatewayFeedSendKind = 'message' | 'photo' | 'media_group';

export interface GatewayFeedSendInput {
  /** Gateway vault id (mapped from the local bot id, never a token). */
  readonly botId: string;
  readonly chatId: string;
  readonly kind: GatewayFeedSendKind;
  readonly text: string;
  /** Photo URL for `photo` kind (the gateway forwards URLs to Bot API). */
  readonly photoUrl?: string;
  /** Media items for `media_group` kind (`{ type, media }` URL items). */
  readonly media?: ReadonlyArray<Record<string, unknown>>;
  readonly parseMode?: 'Markdown' | 'HTML';
  readonly replyMarkup?: TelegramInlineKeyboard;
  /** Idempotency key forwarded as `client_msg_id` (queue entry / job id). */
  readonly clientMsgId?: string;
}

/**
 * Gateway-backed Bot API sender (telegram-bots-gateway todo 5).
 *
 * Divergence from `TelegramPublisherPort`: the token NEVER crosses this
 * port — the gateway resolves it from its own vault (`bot_vault`) by
 * `botId`. Requests are HMAC-signed (`x-api-key` + `x-timestamp` +
 * `x-nonce` + `x-signature`, gateway todo 2 auth). Fail-closed: gateway
 * 401/403/429-persisted/transport errors surface as
 * `{ ok: false, error }`, never a throw for expected failures.
 *
 * Shape limits (gateway `SendDto`): `message` + `photo` (URL) +
 * `media_group` (URL items) only — no video, no local-file upload, no
 * `reply_markup`. Legs carrying those shapes stay direct-only and are
 * recorded as `skipped` (never diverged).
 */
export abstract class BotsGatewaySenderPort {
  public abstract sendViaGateway(
    input: GatewayFeedSendInput,
  ): Promise<TelegramSendResult>;
}
