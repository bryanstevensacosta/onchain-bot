import { CryptoNewsSource } from 'telegram/ingestion/crypto-news/domain/entities/crypto-news-source.entity';

/**
 * Rule defining a regex-based content filter.
 * Lower priority value = higher precedence (applied first).
 */
export interface FilterRule {
  /** Regex pattern string to match */
  pattern: string;
  /** Replacement string (supports $1, $2, etc. for capture groups) */
  replacement: string;
  /** Regex flags (e.g., 'gi', 'g', 'i') */
  flags: string;
  /** Priority: lower value = higher precedence (applied first) */
  priority: number;
  /** Whether this filter is active */
  isActive: boolean;
  /** Creation timestamp for deterministic tie-breaking (priority ASC, createdAt ASC) */
  createdAt: Date;
}

/**
 * Outbound port: persistence for crypto-news Telegram sources.
 *
 * ⚠️ **WRITE METHODS DEPRECATED (2026-09-05)** ⚠️
 *
 * Backend NO LONGER owns crypto-news sources.
 * Ingestion-service is the SOLE OWNER (reads/writes from its own DB).
 *
 * **Migration:**
 * - Read methods (findAll, findActive, findByChannelId): still active for legacy consumers
 * - Write methods (save, delete): REMOVED in T8 (were deprecated, threw errors)
 * - New sources: POST {INGESTION_TELEGRAM_URL}/api/crypto-news/sources
 *
 * Implemented in infrastructure/repositories with the chosen storage
 * (in-memory for dev, TypeORM for prod).
 */
export abstract class CryptoNewsSourceRepository {
  public abstract findByChannelId(
    channelId: string,
  ): Promise<CryptoNewsSource | null>;
  public abstract findAll(): Promise<ReadonlyArray<CryptoNewsSource>>;
  public abstract findActive(): Promise<ReadonlyArray<CryptoNewsSource>>;

  /**
   * Fetch all active filter rules for a channel, ordered by
   * priority ASC then createdAt ASC for deterministic execution.
   */
  public abstract findFiltersByChannelId(
    channelId: string,
  ): Promise<ReadonlyArray<FilterRule>>;
}
