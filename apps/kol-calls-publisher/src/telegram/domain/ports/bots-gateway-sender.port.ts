import type { SendResult } from './telegram-publisher.port';

export interface GatewaySendInput {
  /** Gateway vault id (mapped from the local catalog botId, never a token). */
  readonly botId: string;
  readonly chatId: string;
  readonly text: string;
  readonly imageUrl?: string;
  /** Idempotency key forwarded as `client_msg_id` (job id). */
  readonly clientMsgId?: string;
}

/**
 * Gateway-backed Bot API sender (telegram-bots-gateway todo 4).
 *
 * Divergence from `TelegramPublisherPort`: the token NEVER crosses this
 * port — the gateway resolves it from its own vault (`bot_vault`) by
 * `botId`. Requests are HMAC-signed (`x-api-key` + `x-timestamp` +
 * `x-nonce` + `x-signature`, gateway todo 2 auth). Fail-closed: gateway
 * 401/403/429-persisted/transport errors surface as
 * `{ ok: false, error }`, never a throw for expected failures.
 */
export abstract class BotsGatewaySenderPort {
  public abstract sendViaGateway(input: GatewaySendInput): Promise<SendResult>;
}
