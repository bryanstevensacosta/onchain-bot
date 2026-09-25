import { Keyword } from '../../domain/keyword.entity';

/**
 * Outbound port: persistence for allowed keywords.
 *
 * FK-less by design (spec recommendation): rows carry an optional
 * `templateId` string with no DB-level foreign key. Small table, no
 * pagination. TypeORM adapter lands with the persistence todo (GAP-1);
 * the in-memory adapter is the live binding until then.
 */
export abstract class KeywordRepository {
  public abstract findAll(): Promise<ReadonlyArray<Keyword>>;
  public abstract findEnabled(): Promise<ReadonlyArray<Keyword>>;
  public abstract save(keyword: Keyword): Promise<void>;
  public abstract delete(id: string): Promise<void>;
}
