/**
 * @deprecated Moved to apps/feed-publisher/src/threads/ (Tramo 2, todo 8 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add threads logic in apps/feed-publisher/src/threads/ instead.
 */
import { ThreadsKeyword } from 'threads/publisher/domain/entities/threads-keyword.entity';

/**
 * Outbound port: persistence for threads-publisher keywords.
 *
 * Threads-typed mirror of the crypto-news `KeywordRepository`
 * interface shape (`telegram/crypto-news-publisher/application/ports/
 * keyword.repository.ts`). Same CRUD paths, only the aggregate type
 * differs. The keyword table is small (a few rows at most) — no
 * pagination.
 */
export abstract class ThreadsKeywordRepository {
  public abstract findAll(): Promise<ReadonlyArray<ThreadsKeyword>>;
  public abstract findEnabled(): Promise<ReadonlyArray<ThreadsKeyword>>;
  public abstract save(keyword: ThreadsKeyword): Promise<void>;
  public abstract delete(id: string): Promise<void>;
}
