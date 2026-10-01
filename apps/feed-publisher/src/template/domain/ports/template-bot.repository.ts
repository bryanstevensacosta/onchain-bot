import type { TemplateBot } from '../entities/template-bot.entity';

/**
 * Template-bot catalog repository port (in-memory live, TypeORM deferred GAP-1).
 */
export abstract class TemplateBotRepository {
  public abstract save(bot: TemplateBot): Promise<void>;
  public abstract findById(id: string): Promise<TemplateBot | null>;
  public abstract list(): Promise<ReadonlyArray<TemplateBot>>;
  public abstract remove(id: string): Promise<boolean>;
}
