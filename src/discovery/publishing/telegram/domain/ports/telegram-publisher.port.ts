/**
 * Outbound port: send a text message to a Telegram chat.
 *
 * Implemented by:
 * - v1: MockTelegramPublisherAdapter (logs, does not actually send)
 * - v2: TelegramMtprotoClientAdapter (real MTProto send)
 *
 * Returns the message id (or null on failure).
 */
export abstract class TelegramPublisherPort {
  public abstract sendMessage(
    chatId: string,
    text: string,
  ): Promise<{
    readonly ok: boolean;
    readonly messageId: number | null;
    readonly error: string | null;
  }>;
}
