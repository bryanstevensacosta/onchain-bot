import type { PromptTemplate } from '../prompt-template.entity';

/**
 * Outbound port: persistence for the GLOBAL prompt-template catalog.
 * FK-less by design (keyword bindings are plain strings, no DB-level
 * foreign key). TypeORM adapter lands with the persistence todo
 * (GAP-1); the in-memory adapter is the live binding until then.
 */
export abstract class PromptTemplateRepository {
  public abstract findAll(): Promise<ReadonlyArray<PromptTemplate>>;
  public abstract findById(id: string): Promise<PromptTemplate | null>;
  public abstract save(template: PromptTemplate): Promise<PromptTemplate>;
  public abstract delete(id: string): Promise<boolean>;
}
