import { Injectable } from '@nestjs/common';
import { BotVaultEntry } from '../domain/bot-vault.entity';

/** In-memory vault store (dev/test). TypeORM repository lands with todo 7 (CI/deploy). */
@Injectable()
export class InMemoryBotVaultRepository {
  private readonly rows = new Map<string, BotVaultEntry>();

  public async save(entry: BotVaultEntry): Promise<void> {
    this.rows.set(entry.id, entry);
  }

  public async findById(id: string): Promise<BotVaultEntry | null> {
    return this.rows.get(id) ?? null;
  }

  public async findAll(): Promise<BotVaultEntry[]> {
    return [...this.rows.values()];
  }

  public async delete(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
}
