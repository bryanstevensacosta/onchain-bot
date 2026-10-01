/**
 * @deprecated Moved to apps/feed-publisher/src/threads/ (Tramo 2, todo 8 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add threads logic in apps/feed-publisher/src/threads/ instead.
 */
import { ThreadsBlacklistPhrase } from 'threads/publisher/domain/entities/threads-blacklist-phrase.entity';

/**
 * Outbound port: persistence for threads-publisher blacklist phrases.
 *
 * Threads-typed mirror of the crypto-news `BlacklistPhraseRepository`
 * interface shape (`telegram/crypto-news-publisher/application/ports/
 * blacklist-phrase.repository.ts`). Same CRUD paths, only the aggregate
 * type differs. The blacklist table is small (a few rows at most) — no
 * pagination.
 */
export abstract class ThreadsBlacklistPhraseRepository {
  public abstract findAll(): Promise<ReadonlyArray<ThreadsBlacklistPhrase>>;
  public abstract findEnabled(): Promise<ReadonlyArray<ThreadsBlacklistPhrase>>;
  public abstract save(phrase: ThreadsBlacklistPhrase): Promise<void>;
  public abstract delete(id: string): Promise<void>;
}
