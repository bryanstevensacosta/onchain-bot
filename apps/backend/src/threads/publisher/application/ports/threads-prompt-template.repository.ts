import { ThreadsPromptTemplate } from 'threads/publisher/domain/entities/threads-prompt-template.entity';

/**
 * Outbound port: persistence for threads-publisher prompt templates.
 *
 * Threads-typed mirror of the crypto-news `PromptTemplateRepository`
 * shape. Methods:
 *   - `findAll()` — newest-first ordering NOT guaranteed; callers
 *     that need a stable UI ordering should sort themselves.
 *   - `findById(id)` — single template lookup, returns `null` if
 *     the row is missing.
 *   - `findByIds(ids)` — batch fetch for resolving many
 *     `ThreadsKeyword.templateId` references in one round-trip.
 *   - `save(template)` — upsert; new `ThreadsPromptTemplate.create(...)`
 *     rows are inserted, reconstituted rows are updated in place.
 *   - `delete(id)` — hard delete.
 */
export abstract class ThreadsPromptTemplateRepository {
  public abstract findAll(): Promise<ReadonlyArray<ThreadsPromptTemplate>>;
  public abstract findById(
    id: string,
  ): Promise<ThreadsPromptTemplate | null>;
  public abstract findByIds(
    ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<ThreadsPromptTemplate>>;
  public abstract save(
    template: ThreadsPromptTemplate,
  ): Promise<ThreadsPromptTemplate>;
  public abstract delete(id: string): Promise<void>;
}
