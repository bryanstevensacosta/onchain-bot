import { DeadLetterQueueEntry } from 'telegram/crypto-news-integration/domain/entities/dead-letter-queue-entry.entity';

/**
 * Port: persistence for the crypto-news dead-letter queue.
 *
 * Adapter implementations:
 * - TypeORM: apps/backend/src/telegram/crypto-news-integration/infrastructure/persistence/typeorm/repositories/typeorm-dead-letter-queue.repository.ts
 * - InMemory: (for tests, not wired in prod)
 *
 * The DLQ is manual on-demand ONLY — no automatic retry exists anywhere.
 */
export abstract class DeadLetterQueueRepository {
  /**
   * Persist a fresh PENDING entry. Implementations must NOT throw for
   * duplicates — the service layer guarantees never-throw.
   */
  abstract save(entry: DeadLetterQueueEntry): Promise<void>;

  /** Find one entry by id (null when unknown). */
  abstract findById(id: string): Promise<DeadLetterQueueEntry | null>;

  /** List entries newest-first (failedAt DESC), capped by limit. */
  abstract findAll(
    limit?: number,
  ): Promise<ReadonlyArray<DeadLetterQueueEntry>>;
}
