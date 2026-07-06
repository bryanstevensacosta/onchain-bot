/**
 * Outbound port: send a Telegram message — text or photo.
 *
 * Implemented by BotApiTelegramPublisherAdapter (vip-calls and
 * crypto-news variants), MockTelegramPublisherAdapter, etc.
 *
 * Two methods:
 * - `sendMessage`: text-only (or text + remote image URL). Used by the
 *   vip-calls flow.
 * - `sendPhoto`: text + LOCAL file path. The adapter must upload the
 *   file via `multipart/form-data` (Telegram Bot API supports this on
 *   the `sendPhoto` endpoint). Used by the crypto-news flow because
 *   Telegram CDN URLs expire after ~1h, but the local path persists.
 *
 * Both methods return the same `SendResult` shape so callers can
 * treat them uniformly.
 */

export interface SendResult {
  readonly ok: boolean;
  readonly messageId: number | null;
  readonly error: string | null;
}

export abstract class TelegramPublisherPort {
  public abstract sendMessage(
    chatId: string,
    text: string,
    imageUrl?: string,
  ): Promise<SendResult>;

  /**
   * Send `text` together with a photo read from `imagePath` (local
   * file path on the server). The adapter is responsible for
   * multipart-encoding the request. Telegram's `sendPhoto` accepts
   * `caption` (up to 1024 chars).
   */
  public abstract sendPhoto(
    chatId: string,
    text: string,
    imagePath: string,
  ): Promise<SendResult>;
}
