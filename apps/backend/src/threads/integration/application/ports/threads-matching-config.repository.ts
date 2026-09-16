import { ThreadsMatchingConfig } from 'threads/integration/domain/entities/threads-matching-config.entity';

/**
 * Port: read/write the single-row ThreadsMatchingConfig (id = 1).
 *
 * Threads-typed mirror of the crypto-news `MatchingConfigRepository`
 * (`telegram/crypto-news-integration/application/ports/matching-config.repository.ts`).
 *
 * Adapter implementations:
 * - TypeORM: `threads/integration/infrastructure/persistence/typeorm/repositories/typeorm-threads-matching-config.repository.ts`
 * - InMemory: `threads/integration/application/repositories/in-memory-threads-matching-config.repository.ts` (specs)
 */
export abstract class ThreadsMatchingConfigRepository {
  /**
   * Load the single config row. If the row doesn't exist (first boot),
   * seed it with defaults (enabled = true — threads ships fail-open so
   * the fresh pipeline enqueues immediately; crypto mirror seeds false).
   */
  abstract load(): Promise<ThreadsMatchingConfig>;

  /**
   * Persist the updated config. The caller (controller) is responsible
   * for calling `config.update(...)` before saving.
   */
  abstract save(config: ThreadsMatchingConfig): Promise<void>;
}
