import { Injectable } from '@nestjs/common';
import type { TemplateBot } from '../../domain/entities/template-bot.entity';
import { TemplateBotRepository } from '../../domain/ports/template-bot.repository';

/**
 * In-memory template-bot repository (live; TypeORM deferred GAP-1).
 */
@Injectable()
export class InMemoryTemplateBotRepository extends TemplateBotRepository {
  private readonly rows = new Map<string, TemplateBot>();

  public async save(bot: TemplateBot): Promise<void> {
    this.rows.set(bot.id, bot);
  }

  public async findById(id: string): Promise<TemplateBot | null> {
    return this.rows.get(id) ?? null;
  }

  public async list(): Promise<ReadonlyArray<TemplateBot>> {
    return [...this.rows.values()];
  }

  public async remove(id: string): Promise<boolean> {
    return this.rows.delete(id);
  }
}
