import { Keyword } from 'telegram/crypto-news-publisher/domain/entities/keyword.entity';

/**
 * Outbound port: persistence for crypto-news-publisher keywords.
 *
 * Implemented in infrastructure/ with the chosen storage (in-memory
 * for dev, TypeORM for prod). The keyword table is small (a few
 * rows at most) — operations are simple CRUD with no pagination.
 */
export abstract class KeywordRepository {
  public abstract findAll(): Promise<ReadonlyArray<Keyword>>;
  public abstract findEnabled(): Promise<ReadonlyArray<Keyword>>;
  public abstract save(keyword: Keyword): Promise<void>;
  public abstract delete(id: string): Promise<void>;
}
