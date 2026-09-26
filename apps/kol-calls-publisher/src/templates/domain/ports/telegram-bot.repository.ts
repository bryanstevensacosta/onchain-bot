import type { TelegramBot } from '../entities/telegram-bot.entity';

/**
 * Persistence port for the reusable bot catalog (P23; in-memory today —
 * TypeORM entity + migration land with the persistence todo).
 *
 * Tokens live here ONLY as AES-256-GCM ciphertext (see
 * `EncryptionService`); reads project through `toRedacted()`.
 */
export abstract class TelegramBotRepository {
  public abstract save(bot: TelegramBot): Promise<void>;
  public abstract findById(id: string): Promise<TelegramBot | null>;
  public abstract findAll(): Promise<TelegramBot[]>;
  public abstract remove(id: string): Promise<boolean>;
  public abstract count(): Promise<number>;
}
