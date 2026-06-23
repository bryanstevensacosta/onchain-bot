/**
 * Outbound port: send a text message to a Telegram chat.
 *
 * Implemented by BotApiTelegramPublisherAdapter, MockTelegramPublisherAdapter, etc.
 *
 * Returns the message id (or null on failure).
 */
export abstract class TelegramPublisherPort {
  public abstract sendMessage(
    chatId: string,
    text: string,
    imageUrl?: string,
  ): Promise<{
    readonly ok: boolean;
    readonly messageId: number | null;
    readonly error: string | null;
  }>;
}