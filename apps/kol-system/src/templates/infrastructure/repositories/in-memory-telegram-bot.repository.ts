import { Injectable } from '@nestjs/common';
import { TelegramBotRepository } from '../../domain/ports/telegram-bot.repository';
import type { TelegramBot } from '../../domain/entities/telegram-bot.entity';

/**
 * In-memory bot catalog (upsert by id; tokens stay ciphertext here).
 */
@Injectable()
export class InMemoryTelegramBotRepository extends TelegramBotRepository {
  private readonly rows = new Map<string, TelegramBot>();

  public async save(bot: TelegramBot): Promise<void> {
    this.rows.set(bot.id, bot);
  }

  public async findById(id: string): Promise<TelegramBot | null> {
    return this.rows.get(id) ?? null;
  }

  public async findAll(): Promise<TelegramBot[]> {
    return [...this.rows.values()];
  }

  public async remove(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }

  public async count(): Promise<number> {
    return this.rows.size;
  }
}
