/**
 * Resolves a catalog `botId` to its plaintext Bot API token (P23).
 *
 * Decrypts the `telegram_bots` ciphertext (AES-256-GCM via
 * `EncryptionService`). Unknown bot → `UNAUTHORIZED` (HTTP 401, no post
 * attempted — adversarial: missing token never touches Telegram).
 */
export abstract class BotTokenResolverPort {
  public abstract resolveBotToken(botId: string): Promise<string>;
}
