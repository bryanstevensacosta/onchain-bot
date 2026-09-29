/**
 * @deprecated Moved to apps/feed-publisher/src/ingestion/ + apps/feed-publisher/src/matching/ (Tramo 2, todos 2+3 + P18 companion).
 * Backend legacy copy; stays wired for dual-run and is removed at cutover (todo 11).
 * Do not extend — add feed ingestion/matching logic in apps/feed-publisher/src/ingestion/ or apps/feed-publisher/src/matching/ instead.
 */
import { MatchingConfig } from 'telegram/crypto-news-integration/domain/entities/matching-config.entity';

/**
 * Port: read/write the single-row MatchingConfig (id = 1).
 *
 * Adapter implementations:
 * - TypeORM: apps/backend/src/telegram/crypto-news-integration/infrastructure/persistence/typeorm/repositories/typeorm-matching-config.repository.ts
 * - InMemory: (for tests, not wired in prod)
 */
export abstract class MatchingConfigRepository {
  /**
   * Load the single config row. If the row doesn't exist (first boot),
   * seed it with defaults (enabled = false).
   */
  abstract load(): Promise<MatchingConfig>;

  /**
   * Persist the updated config. The caller (use case) is responsible
   * for calling `config.update(...)` before saving.
   */
  abstract save(config: MatchingConfig): Promise<void>;
}
