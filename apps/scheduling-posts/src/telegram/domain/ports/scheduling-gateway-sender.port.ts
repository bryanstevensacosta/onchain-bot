import type { TelegramSendResult } from './telegram-send-result';

export type SchedulingGatewaySendKind = 'message' | 'photo' | 'media_group';

export interface SchedulingGatewaySendInput {
  /** Gateway vault id (mapped from the session binding botId, never a token). */
  readonly botId: string;
  readonly chatId: string;
  readonly kind: SchedulingGatewaySendKind;
  readonly text: string;
  /** Photo URL for `photo` kind (the gateway forwards URLs to Bot API). */
  readonly photoUrl?: string;
  /** Media items for `media_group` kind (`{ type, media }` URL items). */
  readonly media?: ReadonlyArray<Record<string, unknown>>;
  readonly parseMode?: 'Markdown' | 'HTML';
  /** Idempotency key forwarded as `client_msg_id` (scheduled post id). */
  readonly clientMsgId?: string;
}

/**
 * Gateway-backed sender (contract P42: telegram ONLY via the
 * telegram-bots-gateway). The plaintext token NEVER crosses this port —
 * the gateway resolves it from its own vault by `botId`. Requests are
 * HMAC-signed (`x-api-key` + `x-timestamp` + `x-nonce` + `x-signature`).
 * Fail-closed: auth, upstream and transport failures return
 * `{ ok: false }`, never a throw for expected failures.
 *
 * Shape limits (gateway `SendDto`): `message` + `photo` (URL) +
 * `media_group` (URL items) only — no video, no local-file upload, no
 * `reply_markup`. Sends carrying those shapes are rejected as
 * gateway-incompatible (recorded as skipped, never diverged) so the
 * caller can hold the post instead of inventing a direct leg — there
 * is no direct leg in this app, by contract.
 */
export abstract class SchedulingGatewaySenderPort {
  public abstract sendViaGateway(
    input: SchedulingGatewaySendInput,
  ): Promise<TelegramSendResult>;
}
