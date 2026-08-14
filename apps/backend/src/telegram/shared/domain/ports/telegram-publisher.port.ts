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

/**
 * Optional per-call publishing knobs.
 *
 * - `parseMode`: `'Markdown'` (default) or `'HTML'`. The crypto-news
 *   pipeline publishes Markdown; the ads flow publishes HTML.
 * - `supportsStreaming`: only meaningful for `sendVideo` (Telegram's
 *   `supports_streaming` flag). Defaults to `true` to preserve the
 *   pipeline's current behavior.
 */
export interface TelegramPublishOptions {
  readonly parseMode?: 'Markdown' | 'HTML';
  readonly supportsStreaming?: boolean;
}

export abstract class TelegramPublisherPort {
  /**
   * Check that a Telegram chat exists and the bot can access it.
   * Calls the Bot API `getChat` endpoint under the hood.
   *
   * Returns `{ ok: true }` when the chat exists and is accessible.
   * Returns `{ ok: false, error }` when the chat does not exist, the bot
   * has been kicked, or the chat is private and the bot is not a member.
   *
   * The default implementation throws — adapters that need this method
   * MUST override it (currently only `BotApiCryptoNewsPublisherAdapter`).
   */
  public async getChat(
    _chatId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    throw new Error('getChat not implemented by this adapter');
  }

  public abstract sendMessage(
    chatId: string,
    text: string,
    imageUrl?: string,
    options?: TelegramPublishOptions,
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
    options?: TelegramPublishOptions,
  ): Promise<SendResult>;

  public abstract sendMediaGroup(
    chatId: string,
    text: string,
    imagePaths: string[],
    options?: TelegramPublishOptions,
  ): Promise<SendResult>;

  /**
   * Send `text` together with a video read from `videoPath` (local
   * file path on the server). The adapter is responsible for
   * multipart-encoding the request. Telegram's `sendVideo` accepts
   * `caption` (up to 1024 chars) and `supports_streaming: true`.
   */
  public abstract sendVideo(
    chatId: string,
    text: string,
    videoPath: string,
    options?: TelegramPublishOptions,
  ): Promise<SendResult>;
}
