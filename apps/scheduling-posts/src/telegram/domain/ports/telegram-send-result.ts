/**
 * Gateway send outcome. `messageId` is the gateway-reported Telegram
 * message id (null unless the gateway confirmed the send); `error` is
 * a machine-readable reason (never a token or secret).
 */
export interface TelegramSendResult {
  readonly ok: boolean;
  readonly messageId: number | null;
  readonly error: string | null;
}
