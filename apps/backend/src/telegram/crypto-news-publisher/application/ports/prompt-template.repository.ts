import { PromptTemplate } from 'telegram/crypto-news-publisher/domain/entities/prompt-template.entity';

/**
 * Outbound port: persistence for crypto-news-publisher prompt
 * templates.
 *
 * Methods:
 *   - `findAll()` — newest-first ordering NOT guaranteed; callers
 *     that need a stable UI ordering should sort themselves.
 *   - `findById(id)` — single template lookup, returns `null` if
 *     the row is missing.
 *   - `findByIds(ids)` — batch fetch for resolving many
 *     `Keyword.templateId` references in one round-trip.
 *   - `save(template)` — upsert; new `PromptTemplate.create(...)`
 *     rows are inserted, reconstituted rows are updated in place.
 *     The DB enforces `@Unique(name)` — duplicate names throw at
 *     `save()` time.
 *   - `delete(id)` — hard delete. Refuse-via-409 for in-use
 *     templates is the controller's responsibility (T2).
 */
export abstract class PromptTemplateRepository {
  public abstract findAll(): Promise<ReadonlyArray<PromptTemplate>>;
  public abstract findById(id: string): Promise<PromptTemplate | null>;
  public abstract findByIds(
    ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<PromptTemplate>>;
  public abstract save(template: PromptTemplate): Promise<PromptTemplate>;
  public abstract delete(id: string): Promise<void>;
}
